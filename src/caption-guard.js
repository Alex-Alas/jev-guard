// Guardia de subtítulos. Se intercala entre el motor (STT + traducción) y las
// salidas públicas (LED, vMix, /listen). Habla el MISMO contrato que
// `caption-feed.js` de C2:
//
//   { type:'caption', captionId, revision, committed, mutable, sealed, speaker?, channel? }
//
// y garantiza:
//   1. Ninguna palabra marcada por el léxico sale cruda: se tapa en la MISMA
//      llamada síncrona en la que entra (latencia añadida ≈ 0).
//   2. Jev revisa cada palabra tapada en su contexto. Si fue un error del
//      reconocedor/traductor, la línea se repinta con la corrección.
//   3. `sealed` (lo que se lee en voz alta en /listen) se RETIENE hasta que
//      Jev responda o venza `holdSealMs`; al vencer se sella con la palabra
//      tapada (fail-closed).
//   4. Nunca se emite nada para un subtítulo que ya fue reemplazado en su vía:
//      reabrir una línea vieja rompería el feed.
//   5. `revision` de salida es monótona por captionId (el feed descarta las
//      revisiones que no crecen).

import { detect } from './detector.js';
import { normalize } from './normalize.js';
import { buildHitQuery, decide } from './jev-client.js';

const DEFAULTS = {
  mask: '…',
  holdSealMs: 900,
  maxConcurrent: 4,
  prefetchMutable: true,
  contextChars: 60,
  cacheSize: 500,
  doneMax: 256,
  failureTtlMs: 10_000,
  breakerFailures: 3,
  breakerCooldownMs: 30_000,
  minSeverity: 2,
  thresholds: { allowBelow: 0.35, choiceMin: 0.5 }
};

/**
 * @param {object} opts
 * @param {(msg: object) => void} opts.emit  Recibe cada mensaje ya filtrado.
 * @param {{classify: Function}} [opts.jev]  Cliente de createJevClient. Sin él: modo solo-léxico.
 * @param {(msg: object) => string|undefined} [opts.getSource] Texto fuente en inglés, si el motor lo tiene.
 * @param {(event: object) => void} [opts.onEvent] Telemetría / logs.
 */
export function createCaptionGuard(opts) {
  if (!opts || typeof opts.emit !== 'function') throw new Error('jev-guard: falta opts.emit');
  const cfg = { ...DEFAULTS, ...opts, thresholds: { ...DEFAULTS.thresholds, ...(opts.thresholds || {}) } };
  const now = cfg.now || (() => Date.now());
  const setT = cfg.setTimeout || setTimeout;
  const clearT = cfg.clearTimeout || clearTimeout;
  const onEvent = cfg.onEvent || (() => {});

  let captions = new Map();   // cid -> estado
  let lanes = new Map();      // vía -> cid abierto
  let lastSealed = new Map(); // vía -> texto crudo del último subtítulo sellado (contexto para Jev)
  let done = new Set();
  let doneRing = [];
  const verdicts = new Map(); // clave -> { status, decision?, expiresAt?, waiters:Set }
  const queue = [];
  let inflight = 0;
  let failures = 0;
  let breakerUntil = 0;
  let epoch = 0;              // reset() invalida respuestas en vuelo
  const counters = { in: 0, out: 0, hits: 0, jevCalls: 0, jevErrors: 0, replaced: 0, shown: 0, masked: 0, sealHolds: 0, sealForced: 0, superseded: 0 };

  function safeEmit(msg) {
    counters.out++;
    try { cfg.emit(msg); } catch (err) { onEvent({ type: 'emit_error', error: String(err) }); }
  }

  function maskFor(hit) {
    return typeof cfg.mask === 'function' ? cfg.mask(hit) : cfg.mask;
  }

  function matchCase(word, original) {
    if (!word) return word;
    if (original && original === original.toUpperCase() && original.length > 1) return word.toUpperCase();
    if (original && original[0] !== original[0].toLowerCase()) return word[0].toUpperCase() + word.slice(1);
    return word;
  }

  function markDone(cid) {
    if (done.has(cid)) return;
    done.add(cid);
    doneRing.push(cid);
    while (doneRing.length > cfg.doneMax) done.delete(doneRing.shift());
  }

  // ---------------------------------------------------------------- caché
  function getVerdict(key) {
    const v = verdicts.get(key);
    if (!v) return null;
    if (v.status === 'done' && v.expiresAt && v.expiresAt <= now()) { verdicts.delete(key); return null; }
    verdicts.delete(key); verdicts.set(key, v); // LRU
    return v;
  }

  function trimCache() {
    if (verdicts.size <= cfg.cacheSize) return;
    for (const [k, v] of verdicts) {
      if (verdicts.size <= cfg.cacheSize) break;
      if (v.status !== 'pending') verdicts.delete(k);
    }
  }

  // ---------------------------------------------------------------- Jev
  function request(key, hit, context, cid, optional) {
    if (!cfg.jev) return false;
    if (now() < breakerUntil) {
      verdicts.set(key, { status: 'done', decision: { action: 'mask', reason: 'breaker_open' }, expiresAt: now() + cfg.failureTtlMs, waiters: new Set() });
      return false;
    }
    if (optional && inflight >= cfg.maxConcurrent) return false; // prefetch solo si hay hueco
    const entry = { status: 'pending', waiters: new Set([cid]) };
    verdicts.set(key, entry);
    trimCache();
    queue.push({ key, hit, context, entry, epoch });
    pump();
    return true;
  }

  function pump() {
    while (inflight < cfg.maxConcurrent && queue.length) {
      const job = queue.shift();
      inflight++;
      run(job).finally(() => { inflight--; pump(); });
    }
  }

  async function run(job) {
    const { state, questions, keys } = buildHitQuery(job.hit, job.context);
    counters.jevCalls++;
    onEvent({ type: 'jev_request', id: job.hit.id, word: job.hit.match });
    let decision;
    let expiresAt;
    try {
      const { answers, latency } = await cfg.jev.classify(state, questions);
      failures = 0;
      decision = decide(job.hit, answers, keys, cfg.thresholds);
      onEvent({ type: 'jev_result', id: job.hit.id, word: job.hit.match, latency, decision });
    } catch (err) {
      counters.jevErrors++;
      failures++;
      if (failures >= cfg.breakerFailures) {
        breakerUntil = now() + cfg.breakerCooldownMs;
        onEvent({ type: 'breaker_open', until: breakerUntil });
      }
      decision = { action: 'mask', reason: 'jev_error' };
      expiresAt = now() + cfg.failureTtlMs;
      onEvent({ type: 'jev_error', id: job.hit.id, error: String(err && err.message || err) });
    }
    counters[decision.action === 'replace' ? 'replaced' : decision.action === 'show' ? 'shown' : 'masked']++;
    if (job.epoch !== epoch) return;          // hubo reset()
    if (verdicts.get(job.key) !== job.entry) return;
    job.entry.status = 'done';
    job.entry.decision = decision;
    job.entry.expiresAt = expiresAt;
    const waiters = [...job.entry.waiters];
    job.entry.waiters.clear();
    for (const cid of waiters) {
      const c = captions.get(cid);
      if (c && !c.superseded && !done.has(cid)) emitFor(c, false);
    }
  }

  // ---------------------------------------------------------------- render
  function resolve(hit, joined, c, inMutable) {
    if (hit.censored) return { text: maskFor(hit), pending: false };
    const left = Math.max(0, hit.start - cfg.contextChars);
    const key = `${hit.id}|${normalize(joined.slice(left, hit.end)).replace(/\s+/g, ' ').trim()}`;
    let v = getVerdict(key);
    if (!v) {
      const context = {
        sentence: joined.length > 400 ? joined.slice(Math.max(0, hit.start - 200), hit.end + 200) : joined,
        previous: lastSealed.get(c.lane) || '',
        source: cfg.getSource ? cfg.getSource(c.lastIn) : (c.lastIn.source || undefined)
      };
      const asked = request(key, hit, context, c.cid, inMutable && cfg.prefetchMutable);
      if (inMutable && !cfg.prefetchMutable) return { text: maskFor(hit), pending: false };
      v = verdicts.get(key);
      if (!asked && (!v || v.status !== 'done')) return { text: maskFor(hit), pending: false };
    }
    if (v.status === 'pending') {
      v.waiters.add(c.cid);
      return { text: maskFor(hit), pending: true };
    }
    const d = v.decision || { action: 'mask' };
    if (d.action === 'replace') return { text: matchCase(d.word, hit.match), pending: false, decision: d };
    if (d.action === 'show') return { text: hit.match, pending: false, decision: d };
    return { text: maskFor(hit), pending: false, decision: d };
  }

  function render(c) {
    const m = c.lastIn;
    const committed = String(m.committed ?? '');
    const mutable = String(m.mutable ?? '');
    const sep = committed && mutable ? ' ' : '';
    const joined = committed + sep + mutable;
    const cLen = committed.length;
    const mStart = cLen + sep.length;
    const hits = detect(joined, { minSeverity: cfg.minSeverity });
    counters.hits += hits.length;

    let outC = '';
    let outM = '';
    let pending = false;
    const append = (from, to) => {
      if (from < cLen) outC += joined.slice(from, Math.min(to, cLen));
      if (to > mStart) outM += joined.slice(Math.max(from, mStart), to);
    };
    let cursor = 0;
    for (const hit of hits) {
      append(cursor, hit.start);
      const r = resolve(hit, joined, c, hit.start >= cLen);
      if (r.pending) pending = true;
      if (hit.start < cLen) outC += r.text; else outM += r.text;
      cursor = hit.end;
    }
    append(cursor, joined.length);
    return { committed: outC, mutable: outM, pending, hits: hits.length };
  }

  // ---------------------------------------------------------------- salida
  function emitFor(c, forceSeal) {
    const r = render(c);
    const sealedIn = !!c.lastIn.sealed;
    let sealed = false;
    if (sealedIn) {
      if (!r.pending || forceSeal) {
        sealed = true;
        if (r.pending) { counters.sealForced++; onEvent({ type: 'seal_forced', captionId: c.cid }); }
      } else if (!c.holdTimer) {
        counters.sealHolds++;
        onEvent({ type: 'seal_hold', captionId: c.cid });
        c.holdTimer = setT(() => {
          c.holdTimer = null;
          if (!c.superseded && !done.has(c.cid)) emitFor(c, true);
        }, cfg.holdSealMs);
      }
    }
    const last = c.lastOut;
    if (last && last.committed === r.committed && last.mutable === r.mutable && last.sealed === sealed) return;
    c.lastOut = { committed: r.committed, mutable: r.mutable, sealed };
    c.outRev++;
    if (sealed) {
      if (c.holdTimer) { clearT(c.holdTimer); c.holdTimer = null; }
      markDone(c.cid);
      captions.delete(c.cid);
      if (lanes.get(c.lane) === c.cid) lanes.delete(c.lane);
      lastSealed.set(c.lane, String(c.lastIn.committed ?? ''));
    }
    safeEmit({ ...c.lastIn, committed: r.committed, mutable: r.mutable, sealed, revision: c.outRev });
  }

  function supersede(cid) {
    const prev = captions.get(cid);
    if (!prev) return;
    if (prev.holdTimer) {
      // Tenía el sello retenido: se sella YA (tapado si sigue pendiente),
      // ANTES de que el subtítulo nuevo abra su línea. El orden importa.
      clearT(prev.holdTimer);
      prev.holdTimer = null;
      emitFor(prev, true);
      return;
    }
    prev.superseded = true;
    counters.superseded++;
    captions.delete(cid);
  }

  function push(msg) {
    try {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type && msg.type !== 'caption') {
        if (msg.type === 'clear') reset();
        safeEmit(msg);
        return;
      }
      counters.in++;
      if (msg.captionId == null) { onEvent({ type: 'dropped_no_id' }); return; }
      const cid = String(msg.captionId);
      if (done.has(cid)) return;
      const lane = msg.channel != null ? `c${msg.channel}` : 'g';

      const open = lanes.get(lane);
      if (open && open !== cid) supersede(open);
      lanes.set(lane, cid);

      let c = captions.get(cid);
      if (!c) {
        c = { cid, lane, lastIn: null, lastOut: null, outRev: 0, holdTimer: null, superseded: false };
        captions.set(cid, c);
      }
      if (c.lastIn && !(msg.revision > c.lastIn.revision)) return;
      c.lastIn = msg;
      emitFor(c, false);
    } catch (err) {
      // Fail-closed: si algo interno falla, el mensaje NO sale. El feed sella
      // la línea sola a los 12 s (staleMs) si no llega nada más.
      onEvent({ type: 'guard_error', error: String(err && err.stack || err) });
    }
  }

  function reset() {
    for (const c of captions.values()) if (c.holdTimer) clearT(c.holdTimer);
    captions = new Map();
    lanes = new Map();
    lastSealed = new Map();
    done = new Set();
    doneRing = [];
    epoch++;
    for (const [k, v] of verdicts) if (v.status === 'pending') verdicts.delete(k);
    queue.length = 0;
  }

  return {
    push,
    reset,
    stats: () => ({ ...counters, open: captions.size, cache: verdicts.size, inflight, queued: queue.length, breakerOpen: now() < breakerUntil })
  };
}

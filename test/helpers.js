// Utilidades de prueba: un Jev falso con respuestas programables y un «feed»
// mínimo que aplica las mismas reglas que caption-feed.js de C2 (revisión
// monótona por caption, sellado terminal, una línea abierta por vía).

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * rules: (word, questions) => { real: number, fix?: string, delay?: number, fail?: boolean }
 * `fix` es la PALABRA corregida; se traduce a la clave w0..wn de la pregunta.
 */
export function fakeJev(rules) {
  const calls = [];
  return {
    calls,
    async classify(state, questions) {
      const word = /Flagged word: "([^"]*)"/.exec(state)[1];
      const r = rules(word, questions, state) || { real: 0.9 };
      calls.push({ word, state, questions });
      await sleep(r.delay ?? 5);
      if (r.fail) throw new Error('boom');
      const answers = { real: { noul: r.real } };
      if (questions.fix && r.fix) {
        const key = Object.keys(questions.fix.criteria).find((k) => questions.fix.criteria[k].includes(`"${r.fix}"`)) || 'keep';
        answers.fix = { choice: key };
      }
      return { answers, latency: r.delay ?? 5 };
    }
  };
}

export function fakeFeed() {
  const lines = new Map(); // cid -> { text, sealed }
  const rev = new Map();
  const done = new Set();
  const lane = new Map();
  const reopened = [];
  const shown = []; // todo lo que llegó a pintarse
  return {
    lines, shown, reopened,
    push(m) {
      if (m.type && m.type !== 'caption') return;
      const cid = String(m.captionId);
      if (done.has(cid)) return;
      const ln = m.channel != null ? 'c' + m.channel : 'g';
      if (lane.get(ln) && lane.get(ln) !== cid) {
        const prev = lane.get(ln);
        if (lines.has(prev)) lines.get(prev).closed = true;
      }
      if (lines.has(cid) && lines.get(cid).closed && !done.has(cid)) reopened.push(cid);
      lane.set(ln, cid);
      if (rev.has(cid) && !(m.revision > rev.get(cid))) return;
      rev.set(cid, m.revision);
      const text = `${m.committed || ''} ${m.mutable || ''}`.trim();
      lines.set(cid, { text, sealed: !!m.sealed, closed: !!m.sealed });
      shown.push(text);
      if (m.sealed) done.add(cid);
    }
  };
}

export function cap(id, revision, committed, mutable = '', sealed = false, extra = {}) {
  return { type: 'caption', captionId: id, revision, committed, mutable, sealed, ...extra };
}

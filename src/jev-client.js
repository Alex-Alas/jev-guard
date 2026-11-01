// Cliente de Jev (TypeSafe vía Command Code). Jev es un CLASIFICADOR: recibe un
// `state` (texto) y `questions` tipadas (noul = probabilidad 0..1, choice =
// una opción, score = escala) y devuelve `answers`. No genera texto libre: por
// eso la corrección se pide como `choice` entre candidatos que da el léxico.

export const COMMAND_CODE_ENDPOINT = 'https://api.commandcode.ai/provider/v1/systemone';
export const DEFAULT_MODEL = 'typesafe/jev';
// TypeSafe directo (sin CORS: solo desde servidor). Probado el 31-oct-2026.
export const TYPESAFE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const TYPESAFE_MODEL = 'jev-latest';

/**
 * @param {object} opts
 * @param {string} [opts.apiKey]     Solo en servidor. NUNCA en el navegador.
 * @param {string} [opts.endpoint]   Por defecto Command Code.
 * @param {string} [opts.proxyUrl]   En navegador: URL del proxy (server/jev-proxy.mjs).
 * @param {string} [opts.model]
 * @param {number} [opts.timeoutMs]  Presupuesto por llamada. Por defecto 1500 ms.
 * @param {typeof fetch} [opts.fetch]
 */
export function createJevClient(opts = {}) {
  const fetchImpl = opts.fetch || globalThis.fetch;
  const model = opts.model || DEFAULT_MODEL;
  const timeoutMs = opts.timeoutMs ?? 1500;
  if (!opts.proxyUrl && !opts.apiKey) {
    throw new Error('jev-guard: falta apiKey (servidor) o proxyUrl (navegador).');
  }

  return {
    model,
    /** @returns {Promise<{answers: object, latency: number}>} */
    async classify(state, questions, signal) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error('jev_timeout')), timeoutMs);
      const onAbort = () => controller.abort(signal.reason);
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      const started = Date.now();
      try {
        const payload = { model, state, questions };
        const res = await fetchImpl(opts.proxyUrl || opts.endpoint || COMMAND_CODE_ENDPOINT, {
          method: 'POST',
          headers: opts.proxyUrl
            ? { 'Content-Type': 'application/json' }
            : { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
          body: JSON.stringify(opts.proxyUrl ? { payload } : payload),
          signal: controller.signal
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`jev_http_${res.status}`);
        const data = JSON.parse(text);
        if (!data || typeof data.answers !== 'object') throw new Error('jev_bad_response');
        return { answers: data.answers, latency: Date.now() - started };
      } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
      }
    }
  };
}

/**
 * Arma la pregunta para UNA palabra marcada dentro de su contexto.
 * Devuelve { state, questions, keys } donde keys mapea opción -> palabra.
 */
export function buildHitQuery(hit, context) {
  const lines = [
    'Live subtitles of a conference talk. The speaker talks in English; an AI speech recognizer transcribes it and an AI translator renders Spanish subtitles shown on a big public LED screen.',
    'Speech recognition and translation sometimes produce a vulgar word that was never said (e.g. "fork" heard as a swear word, or a mistranslation).'
  ];
  if (context.source) lines.push(`Original English (may also contain recognition errors): "${context.source}"`);
  if (context.previous) lines.push(`Previous subtitle: "${context.previous}"`);
  lines.push(`Current subtitle: "${context.sentence}"`);
  lines.push(`Flagged word: "${hit.match}"`);
  const state = lines.join('\n');

  const questions = {
    real: {
      type: 'noul',
      instructions: `Given the topic and the surrounding words, is it likely that the speaker really meant the vulgar/offensive word "${hit.match}" (used as profanity, insult or slur), rather than this being a recognition/translation error or an innocent everyday meaning of the word?`,
      criteria: {
        true: `The speaker most likely used "${hit.match}" as profanity, insult or slur.`,
        false: `"${hit.match}" is most likely a recognition/translation error, or it is used with an innocent meaning.`
      }
    }
  };

  const keys = {};
  const alts = (hit.alts || []).slice(0, 6);
  if (alts.length) {
    const criteria = {};
    alts.forEach((word, i) => {
      keys[`w${i}`] = word;
      criteria[`w${i}`] = `The intended word was "${word}".`;
    });
    criteria.keep = `None of these fit; "${hit.match}" is the word the speaker said.`;
    questions.fix = {
      type: 'choice',
      instructions: `If "${hit.match}" is a recognition or translation error, which word fits the sentence and the topic best?`,
      criteria
    };
  }
  return { state, questions, keys };
}

/**
 * Convierte las respuestas de Jev en una decisión.
 *   { action: 'mask' }                       -> se queda tapada
 *   { action: 'show' }                       -> se muestra la original (solo amb)
 *   { action: 'replace', word: 'fork' }      -> se muestra la corrección
 */
export function decide(hit, answers, keys, thresholds = {}) {
  // Valores calibrados con Jev real (TypeSafe jev-latest, 31-oct-2026). Ver docs/CALIBRACION.md.
  const allowBelow = thresholds.allowBelow ?? 0.2;
  const choiceMin = thresholds.choiceMin ?? 0.8;
  const keepMax = thresholds.keepMax ?? 0.15;
  const p = answers?.real?.noul;
  if (typeof p !== 'number' || Number.isNaN(p)) return { action: 'mask', reason: 'no_answer' };
  if (p >= allowBelow) return { action: 'mask', reason: 'likely_profanity', p };

  const fix = answers.fix;
  const choice = fix && fix.choice;
  if (choice && keys[choice]) {
    // Jev devuelve { choice, confidence, probabilities }. Se exige que la opción
    // elegida sea clara Y que «keep» (era la palabra original) sea improbable.
    const dist = fix.probabilities || {};
    const conf = typeof dist[choice] === 'number' ? dist[choice] : (typeof fix.confidence === 'number' ? fix.confidence : 0);
    const keep = typeof dist.keep === 'number' ? dist.keep : 1;
    if (conf >= choiceMin && keep <= keepMax) return { action: 'replace', word: keys[choice], reason: 'asr_error', p, conf };
  }
  if (hit.amb) return { action: 'show', reason: 'innocent_meaning', p };
  return { action: 'mask', reason: 'no_safe_correction', p };
}

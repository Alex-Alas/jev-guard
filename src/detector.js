// Detector léxico local. Síncrono, sin red, ~0,1 ms por actualización de
// subtítulo. Es la primera línea: decide QUÉ tapar al instante. Jev decide
// después si lo tapado era de verdad una grosería.

import { LEXICON } from './lexicon.js';
import { normalize } from './normalize.js';

const L = '(?<![\\p{L}\\p{N}])';
const R = '(?![\\p{L}\\p{N}])';
const WORD_SEP = "[\\s.,;:¡!¿?…'\"\\-]+";

// Palabras que el propio motor STT ya censuró («f***», «s**t», «***»).
// No se puede recuperar la palabra, así que siempre se tapa sin preguntar.
const CENSORED = /(?<![\p{L}\p{N}*])[\p{L}]{0,3}\*{2,}[\p{L}]{0,3}(?![\p{L}\p{N}*])/gu;

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// «fuck» -> f+u+c+k+  ·  «perra» -> p+e+r{2,}a+  (tolera letras estiradas)
function fuzzyWord(word) {
  let out = '';
  let i = 0;
  while (i < word.length) {
    const ch = word[i];
    let j = i + 1;
    while (j < word.length && word[j] === ch) j++;
    const run = j - i;
    out += escapeRegex(ch) + (run >= 2 ? `{${run},}` : '+');
    i = j;
  }
  return out;
}

function variantPattern(variant) {
  return normalize(variant).split(/\s+/).filter(Boolean).map(fuzzyWord).join(WORD_SEP);
}

let compiled = null;

function compile(lexicon) {
  return lexicon.map((entry) => {
    const alternatives = [...new Set(entry.v.map(variantPattern))]
      .sort((a, b) => b.length - a.length); // la más larga primero
    return {
      entry,
      regex: new RegExp(`${L}(?:${alternatives.join('|')})${R}`, 'gu'),
      safe: entry.safe ? new RegExp(entry.safe, 'u') : null,
      unsafe: entry.unsafe ? new RegExp(entry.unsafe, 'u') : null,
      bad: entry.bad ? new RegExp(entry.bad, 'u') : null
    };
  });
}

function sentenceWindow(text, start, end) {
  let left = start;
  while (left > 0 && !'.!?\n'.includes(text[left - 1]) && start - left < 160) left--;
  let right = end;
  while (right < text.length && !'.!?\n'.includes(text[right]) && right - end < 160) right++;
  return text.slice(left, right);
}

/**
 * Busca groserías en `text`.
 * @param {string} text
 * @param {{minSeverity?: number, lexicon?: Array}} [options]
 * @returns {Array<{start:number,end:number,match:string,id:string,lang:string,
 *   cat:string,sev:number,amb:boolean,alts:string[],censored:boolean}>}
 *   Sin solapes, ordenadas por posición.
 */
export function detect(text, options = {}) {
  const source = String(text ?? '');
  if (!source) return [];
  const minSeverity = options.minSeverity ?? 2;
  const table = options.lexicon ? compile(options.lexicon) : (compiled ??= compile(LEXICON));
  const norm = normalize(source);
  const raw = [];

  for (const c of table) {
    if (c.entry.sev < minSeverity) continue;
    c.regex.lastIndex = 0;
    let m;
    while ((m = c.regex.exec(norm)) !== null) {
      if (!m[0]) { c.regex.lastIndex++; continue; }
      const start = m.index;
      const end = start + m[0].length;
      const around = sentenceWindow(norm, start, end);
      if (c.safe && c.safe.test(around) && !(c.unsafe && c.unsafe.test(around))) continue;
      if (c.bad && !c.bad.test(around)) continue;
      raw.push({
        start, end,
        match: source.slice(start, end),
        id: c.entry.id,
        lang: c.entry.lang,
        cat: c.entry.cat,
        sev: c.entry.sev,
        amb: !!c.entry.amb,
        alts: c.entry.alts || [],
        censored: false
      });
    }
  }

  CENSORED.lastIndex = 0;
  let m;
  while ((m = CENSORED.exec(source)) !== null) {
    raw.push({
      start: m.index, end: m.index + m[0].length, match: m[0],
      id: 'censored', lang: '?', cat: 'censurado', sev: 4, amb: false, alts: [], censored: true
    });
  }

  // Sin solapes: gana la que empieza antes; a igual inicio, la más larga.
  raw.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start) || b.sev - a.sev);
  const hits = [];
  let lastEnd = -1;
  for (const h of raw) {
    if (h.start >= lastEnd) { hits.push(h); lastEnd = h.end; }
  }
  return hits;
}

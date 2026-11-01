// Prueba de Jev REAL: verifica el formato de respuesta (S1, S2) y mide latencia.
//   TYPESAFE_JEV_API_KEY=...  node examples/probe-jev.mjs   (TypeSafe directo)
//   COMMAND_CODE_API_KEY=...  node examples/probe-jev.mjs   (Command Code)
import { createJevClient, buildHitQuery, decide, detect } from '../src/index.js';
import { jevFromEnv } from './jev-from-env.mjs';

const { jev, label } = jevFromEnv({ timeoutMs: 8000 });
if (!jev) { console.error('Falta TYPESAFE_JEV_API_KEY o COMMAND_CODE_API_KEY'); process.exit(1); }
console.log('Proveedor:', label, '\n');

// [frase, esperado]  esperado: 'replace <palabra>' | 'mask' | 'show'
const cases = [
  // Errores de reconocimiento/traducción en charla técnica -> corregir
  ['Abran la shit de cálculo y revisen la columna de costos.', 'replace sheet'],
  ['Hagan un fuck del repositorio en GitHub y después abran un pull request.', 'replace fork'],
  ['Mañana tenemos que hacer el bitch frente a los inversionistas.', 'replace pitch'],
  ['Hay que hacer un shit de paradigma en cómo entrenamos los modelos.', 'replace shift'],
  ['Nuestro sistema puede cunt cuántos usuarios entran por minuto.', 'replace count'],
  ['El nuevo modelo tiene que cargar todo el contexto antes de responder, si no, va a cagar la memoria.', 'mask'],
  ['Si el agente pierde la ruta, vuelve a la puta inicial del grafo.', 'replace ruta'],
  // Groserías reales -> tapar
  ['Honestamente, el primer prototipo fue una mierda total.', 'mask'],
  ['Ese pendejo nunca entendió el modelo de negocio.', 'mask'],
  ['Este código es una mierda, hay que reescribirlo completo.', 'mask'],
  ['Fue fucking increíble ver el demo funcionando en vivo.', 'mask'],
  ['Qué puta madre, se nos cayó el servidor en plena demo.', 'mask'],
  ['El cliente se puso como un cabrón cuando vio la factura.', 'mask'],
  // Palabras ambiguas inocentes -> mostrar
  ['Mi perra se llama Kira y siempre me acompaña cuando programo.', 'show'],
  ['Encontramos una concha enorme en la playa durante el retiro del equipo.', 'show']
];

const REPEAT = Number(process.env.REPEAT || 2);
const rows = [];
for (const [sentence, expected] of cases) {
  const hit = detect(sentence)[0];
  if (!hit) { rows.push({ word: '-', expected, got: 'sin hit', ok: expected === 'show' || expected === 'mask' ? '?' : 'NO', ms: 0, sentence }); continue; }
  const { state, questions, keys } = buildHitQuery(hit, { sentence });
  for (let r = 0; r < REPEAT; r++) {
    try {
      const { answers, latency } = await jev.classify(state, questions);
      const d = decide(hit, answers, keys);
      const got = d.action + (d.word ? ' ' + d.word : '');
      const dangerous = expected === 'mask' && d.action !== 'mask';
      rows.push({ word: hit.match, expected, got, ok: got === expected ? 'OK' : dangerous ? 'PELIGRO' : 'conservador', p: answers.real?.noul, fix: answers.fix ? `${keys[answers.fix.choice] || answers.fix.choice}:${(answers.fix.probabilities || {})[answers.fix.choice]} keep:${(answers.fix.probabilities || {}).keep}` : '-', ms: latency });
    } catch (e) {
      rows.push({ word: hit.match, expected, got: 'ERROR ' + e.message, ok: 'conservador', ms: 0 });
    }
  }
}
console.table(rows.map(({ sentence, ...r }) => r));
const lat = rows.filter((r) => r.ms > 0).map((r) => r.ms).sort((a, b) => a - b);
const pct = (q) => lat[Math.min(lat.length - 1, Math.floor(q * lat.length))];
console.log(`latencia ms: p50=${pct(0.5)} p90=${pct(0.9)} max=${lat.at(-1)} (n=${lat.length})`);
console.log(`resultado: OK=${rows.filter((r) => r.ok === 'OK').length} conservador=${rows.filter((r) => r.ok === 'conservador').length} PELIGRO=${rows.filter((r) => r.ok === 'PELIGRO').length}`);

// Simulación en consola: un ponente habla, el STT reescribe la cola y el guard
// filtra antes de la «pantalla». Muestra en orden lo que vería el público.
//
//   npm run simulate                      -> Jev simulado (sin red)
//   TYPESAFE_JEV_API_KEY=... o COMMAND_CODE_API_KEY=... npm run simulate  -> Jev real

import { createCaptionGuard } from '../src/index.js';
import { jevFromEnv } from './jev-from-env.mjs';

const real = jevFromEnv({ timeoutMs: 1500 });
const started = Date.now();
const t = () => String(Date.now() - started).padStart(5, ' ') + ' ms';

// Jev simulado: «shit» en contexto de hojas de cálculo era «sheet»; lo demás es real.
const mockJev = {
  async classify(state, questions) {
    await new Promise((r) => setTimeout(r, 350));
    const word = /Flagged word: "([^"]*)"/.exec(state)[1].toLowerCase();
    const answers = { real: { noul: word === 'shit' ? 0.04 : 0.93 } };
    if (questions.fix) {
      const k = Object.keys(questions.fix.criteria).find((x) => questions.fix.criteria[x].includes('"sheet"'));
      const c = word === 'shit' && k ? k : 'keep';
      answers.fix = { choice: c, confidence: 1, probabilities: { [c]: 1, keep: c === 'keep' ? 1 : 0 } };
    }
    return { answers, latency: 350 };
  }
};

const jev = real.jev || mockJev;
console.log(real.jev ? `Jev REAL · ${real.label}\n` : 'Jev SIMULADO (350 ms)\n');

const guard = createCaptionGuard({
  jev,
  emit: (m) => {
    if (m.type !== 'caption') return;
    const line = `${m.committed}${m.mutable ? ' ⟨' + m.mutable + '⟩' : ''}`;
    console.log(`${t()}  [${m.captionId} r${m.revision}${m.sealed ? ' SELLADO' : ''}]  ${line}`);
  },
  onEvent: (e) => {
    if (e.type === 'jev_result') console.log(`${t()}    jev: «${e.word}» -> ${e.decision.action}${e.decision.word ? ' «' + e.decision.word + '»' : ''} (p=${e.decision.p?.toFixed?.(2)}, ${e.latency} ms)`);
    if (e.type === 'seal_hold') console.log(`${t()}    sello retenido esperando a Jev`);
    if (e.type === 'jev_error') console.log(`${t()}    jev error: ${e.error}`);
  }
});

// Lo que el motor emitiría (español ya traducido), palabra a palabra.
const script = [
  ['s1', 'Abran la shit de cálculo y revisen la columna de costos.'],
  ['s2', 'Honestamente, el primer prototipo fue una mierda total.'],
  ['s3', 'Pero el equipo aprendió muchísimo en el proceso.']
];

for (const [id, sentence] of script) {
  const words = sentence.split(' ');
  for (let k = 1; k <= words.length; k++) {
    const cut = Math.max(0, k - 3);
    guard.push({ type: 'caption', captionId: id, revision: k, committed: words.slice(0, cut).join(' '), mutable: words.slice(cut, k).join(' '), sealed: false });
    await new Promise((r) => setTimeout(r, 90));
  }
  guard.push({ type: 'caption', captionId: id, revision: words.length + 1, committed: sentence, mutable: '', sealed: true });
  await new Promise((r) => setTimeout(r, 150));
}
await new Promise((r) => setTimeout(r, 1200));
console.log('\nstats', guard.stats());

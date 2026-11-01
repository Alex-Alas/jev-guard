import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaptionGuard } from '../src/caption-guard.js';
import { detect } from '../src/detector.js';
import { fakeJev, fakeFeed, cap, sleep } from './helpers.js';

function setup(rules, extra = {}) {
  const out = [];
  const feed = fakeFeed();
  const jev = rules ? fakeJev(rules) : undefined;
  const guard = createCaptionGuard({
    jev,
    holdSealMs: 80,
    emit: (m) => { out.push(m); feed.push(m); },
    ...extra
  });
  return { guard, out, feed, jev };
}

const text = (m) => `${m.committed} ${m.mutable}`.trim();

test('una grosería en la cola mutable se tapa en la misma llamada (síncrono)', () => {
  const { guard, out } = setup(() => ({ real: 0.9, delay: 50 }));
  guard.push(cap('a', 1, 'Hoy vamos a', 'hablar de mierda'));
  assert.equal(out.length, 1);
  assert.equal(text(out[0]), 'Hoy vamos a hablar de …');
});

test('error del reconocedor: se tapa y luego se repinta con la corrección', async () => {
  const { guard, out } = setup((w) => w === 'fucking' ? { real: 0.05, fix: 'fact' } : null);
  guard.push(cap('a', 1, 'Vamos a hablar del fucking en datos'));
  assert.equal(text(out[0]), 'Vamos a hablar del … en datos');
  await sleep(30);
  assert.equal(text(out.at(-1)), 'Vamos a hablar del fact en datos');
  assert.ok(out.at(-1).revision > out[0].revision);
});

test('grosería real: se queda tapada', async () => {
  const { guard, out } = setup(() => ({ real: 0.97 }));
  guard.push(cap('a', 1, 'Eso fue una mierda', '', true));
  await sleep(30);
  assert.ok(out.every((m) => !text(m).includes('mierda')));
  assert.equal(out.at(-1).sealed, true);
  assert.equal(text(out.at(-1)), 'Eso fue una …');
});

test('palabra ambigua con significado inocente: se muestra', async () => {
  const { guard, out } = setup(() => ({ real: 0.05 }));
  guard.push(cap('a', 1, 'Mi perra se llama Kira y es lo máximo', '', true));
  await sleep(30);
  assert.equal(text(out.at(-1)), 'Mi perra se llama Kira y es lo máximo');
});

test('no ambigua y sin corrección: aunque Jev dude, sigue tapada', async () => {
  const { guard, out } = setup(() => ({ real: 0.05 }));
  guard.push(cap('a', 1, 'esto es pendejo', '', true));
  await sleep(30);
  assert.equal(text(out.at(-1)), 'esto es …');
});

test('el sello se retiene hasta que Jev responde', async () => {
  const { guard, out } = setup(() => ({ real: 0.05, fix: 'sheet', delay: 30 }));
  guard.push(cap('a', 1, 'Abran la shit de cálculo', '', true));
  assert.equal(out[0].sealed, false, 'no se sella con veredicto pendiente');
  await sleep(60);
  const last = out.at(-1);
  assert.equal(last.sealed, true);
  assert.equal(text(last), 'Abran la sheet de cálculo');
});

test('si Jev tarda más que holdSealMs, se sella TAPADO (fail-closed)', async () => {
  const { guard, out, feed } = setup(() => ({ real: 0.05, fix: 'sheet', delay: 300 }));
  guard.push(cap('a', 1, 'Abran la shit de cálculo', '', true));
  await sleep(120);
  assert.equal(out.at(-1).sealed, true);
  assert.equal(text(out.at(-1)), 'Abran la … de cálculo');
  const n = out.length;
  await sleep(250);
  assert.equal(out.length, n, 'el veredicto tardío no repinta un subtítulo sellado');
  assert.equal(feed.reopened.length, 0);
});

test('un subtítulo nuevo en la vía sella primero el retenido (orden correcto)', async () => {
  const { guard, out, feed } = setup(() => ({ real: 0.05, fix: 'sheet', delay: 300 }));
  guard.push(cap('a', 1, 'la shit', '', true));
  guard.push(cap('b', 1, 'Siguiente frase'));
  const iA = out.findIndex((m) => m.captionId === 'a' && m.sealed);
  const iB = out.findIndex((m) => m.captionId === 'b');
  assert.ok(iA >= 0 && iA < iB);
  await sleep(350);
  assert.equal(feed.reopened.length, 0);
});

test('nunca se emite para un subtítulo reemplazado sin sellar', async () => {
  const { guard, out } = setup(() => ({ real: 0.05, fix: 'sheet', delay: 40 }));
  guard.push(cap('a', 1, 'la shit'));
  guard.push(cap('b', 1, 'otra cosa'));
  await sleep(80);
  assert.equal(out.filter((m) => m.captionId === 'a').length, 1);
});

test('vías distintas no se pisan', async () => {
  const { guard, out } = setup(() => ({ real: 0.05, fix: 'sheet', delay: 20 }));
  guard.push(cap('a', 1, 'la shit', '', false, { channel: 0 }));
  guard.push(cap('b', 1, 'hola', '', false, { channel: 1 }));
  await sleep(50);
  assert.equal(text(out.filter((m) => m.captionId === 'a').at(-1)), 'la sheet');
});

test('revisiones viejas o repetidas se ignoran; la salida es monótona', () => {
  const { guard, out } = setup(null);
  guard.push(cap('a', 2, 'hola'));
  guard.push(cap('a', 1, 'viejo'));
  guard.push(cap('a', 2, 'repetido'));
  guard.push(cap('a', 3, 'hola mundo'));
  assert.deepEqual(out.map(text), ['hola', 'hola mundo']);
  assert.deepEqual(out.map((m) => m.revision), [1, 2]);
});

test('mensajes que no son caption pasan intactos; clear reinicia', () => {
  const { guard, out } = setup(null);
  guard.push({ type: 'state', live: true });
  guard.push(cap('a', 1, 'x', '', true));
  guard.push({ type: 'clear' });
  guard.push(cap('a', 1, 'x otra vez'));
  assert.equal(out[0].type, 'state');
  assert.equal(out[2].type, 'clear');
  assert.equal(text(out[3]), 'x otra vez');
});

test('una sola llamada a Jev por palabra aunque la línea crezca', async () => {
  const { guard, jev } = setup(() => ({ real: 0.05, fix: 'sheet', delay: 20 }));
  guard.push(cap('a', 1, 'abran la shit'));
  guard.push(cap('a', 2, 'abran la shit de', 'cálculo'));
  guard.push(cap('a', 3, 'abran la shit de cálculo', 'por favor'));
  await sleep(40);
  assert.equal(jev.calls.length, 1);
});

test('circuit breaker: tras 3 fallos deja de llamar y todo queda tapado', async () => {
  const { guard, jev, out } = setup(() => ({ fail: true, delay: 1 }), { maxConcurrent: 1 });
  for (let i = 0; i < 6; i++) {
    guard.push(cap(`c${i}`, 1, `frase ${i} con mierda número ${i}`, '', true));
    await sleep(10);
  }
  assert.equal(jev.calls.length, 3);
  assert.ok(out.every((m) => !text(m).includes('mierda')));
});

test('modo solo-léxico (sin Jev): tapa y sella sin esperar', () => {
  const { guard, out } = setup(null);
  guard.push(cap('a', 1, 'qué mierda', '', true));
  assert.equal(out.length, 1);
  assert.equal(out[0].sealed, true);
  assert.equal(text(out[0]), 'qué …');
});

test('propiedad: con Jev diciendo «real», ninguna grosería llega jamás a pantalla', async () => {
  const words = ['hola', 'modelo', 'datos', 'mierda', 'fucking', 'pendejo', 'agente', 'shit', 'puta', 'nube', 'cerote', 'bitch'];
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const { guard, feed } = setup(() => ({ real: 0.95, delay: Math.floor(rnd() * 40) }), { maxConcurrent: 2 });
  for (let s = 0; s < 40; s++) {
    const ws = Array.from({ length: 6 + Math.floor(rnd() * 8) }, () => words[Math.floor(rnd() * words.length)]);
    for (let k = 1; k <= ws.length; k++) {
      const cut = Math.max(0, k - 2);
      guard.push(cap(`s${s}`, k, ws.slice(0, cut).join(' '), ws.slice(cut, k).join(' '), false, { channel: s % 3 }));
    }
    guard.push(cap(`s${s}`, ws.length + 1, ws.join(' '), '', true, { channel: s % 3 }));
    if (s % 5 === 0) await sleep(15);
  }
  await sleep(200);
  for (const t of feed.shown) assert.deepEqual(detect(t), [], t);
  assert.equal(feed.reopened.length, 0);
});

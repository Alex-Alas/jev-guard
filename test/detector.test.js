import test from 'node:test';
import assert from 'node:assert/strict';
import { detect } from '../src/detector.js';

const ids = (t) => detect(t).map((h) => h.id);

test('detecta groserías en español', () => {
  assert.deepEqual(ids('Ese pendejo es un hijo de puta.'), ['es_pendejo', 'es_hijo_puta']);
  assert.deepEqual(ids('¡Qué mierda!'), ['es_mierda']);
  assert.deepEqual(ids('Qué cerote más necio'), ['es_cerote']);
});

test('detecta groserías en inglés que quedan sin traducir', () => {
  assert.deepEqual(ids('Esto es fucking increíble'), ['en_fuck']);
  assert.deepEqual(ids('what the shit'), ['en_shit']);
});

test('prefiere la coincidencia más larga y no solapa', () => {
  const hits = detect('la puta madre');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'es_puta_madre');
});

test('respeta contextos inocentes', () => {
  assert.deepEqual(ids('El árbitro tocó el pito al final del partido.'), []);
  assert.deepEqual(ids('Mi perra es una mascota muy tranquila.'), []);
  assert.deepEqual(ids('El vuelo llegó retrasado por el tráfico.'), []);
  assert.deepEqual(ids('Vamos a coger el autobús.'), []);
});

test('no marca frases normales de una charla técnica', () => {
  const clean = [
    'Bienvenidos a MTech AI Latam, hoy hablaremos de modelos de lenguaje.',
    'La computadora procesa la disputa entre dos agentes.',
    'Tenemos 5 casos de uso y 4 equipos trabajando.',
    'La clase de inteligencia artificial empieza a las tres.',
    'Esta arquitectura escala a millones de usuarios en la nube.',
    'El pasajero cargó la maleta y pagó el boleto.',
    'Hay que estar pendiente de los resultados.'
  ];
  for (const t of clean) assert.deepEqual(ids(t), [], t);
});

test('palabras ya censuradas por el STT se tapan siempre', () => {
  const hits = detect('what the f*** is this');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].censored, true);
});

test('offsets apuntan al texto original (acentos y mayúsculas)', () => {
  const text = 'Dijo «PENDÉJO» en voz alta';
  const [h] = detect(text);
  assert.equal(text.slice(h.start, h.end), 'PENDÉJO');
});

test('rendimiento: menos de 1 ms por subtítulo típico', () => {
  const t = 'Hoy vamos a hablar de cómo los agentes de inteligencia artificial cambian la forma en que trabajamos en equipo.';
  detect(t); // compila
  const n = 500;
  const t0 = performance.now();
  for (let i = 0; i < n; i++) detect(t);
  const per = (performance.now() - t0) / n;
  assert.ok(per < 1, `${per.toFixed(3)} ms`);
});

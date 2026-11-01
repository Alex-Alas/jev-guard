// Proxy mínimo para usar jev-guard DESDE EL NAVEGADOR sin exponer la API key.
// Si el guard corre en el servidor del motor (opción recomendada), NO hace falta.
//
//   COMMAND_CODE_API_KEY=... ALLOWED_ORIGINS=https://c2-live-xxxx.a.run.app node server/jev-proxy.mjs
//
// - La key vive solo en este proceso.
// - Solo acepta orígenes de ALLOWED_ORIGINS (sin comodín «*»): otra página
//   abierta en el mismo equipo no puede gastar la cuota.
// - Solo reenvía payloads con forma de Jev (state + questions) y fuerza el modelo.

import http from 'node:http';

const PORT = Number(process.env.PORT || 8790);
const HOST = process.env.HOST || '127.0.0.1';
const KEY = process.env.COMMAND_CODE_API_KEY || process.env.COMMAND_CODE_MAIN_API || '';
const ENDPOINT = process.env.JEV_ENDPOINT || 'https://api.commandcode.ai/provider/v1/systemone';
const MODEL = process.env.JEV_MODEL || 'typesafe/jev';
const ALLOWED = new Set((process.env.ALLOWED_ORIGINS || `http://localhost:${PORT}`).split(',').map((s) => s.trim()).filter(Boolean));
const MAX_BODY = 32 * 1024;
const PER_MINUTE = Number(process.env.RATE_PER_MINUTE || 600);

if (!KEY) {
  console.error('Falta COMMAND_CODE_API_KEY');
  process.exit(1);
}

let windowStart = Date.now();
let windowCount = 0;

function headersFor(origin) {
  const h = { 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (origin && ALLOWED.has(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Allow-Private-Network'] = 'true';
  }
  return h;
}

function send(res, status, body, origin) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { ...headersFor(origin), 'Content-Type': 'application/json; charset=utf-8' });
  res.end(text);
}

http.createServer((req, res) => {
  const origin = req.headers.origin;
  if (req.method === 'OPTIONS') { res.writeHead(204, headersFor(origin)); res.end(); return; }
  if (req.method === 'GET' && req.url === '/health') { send(res, 200, { ok: true, model: MODEL }, origin); return; }
  if (req.method !== 'POST' || req.url !== '/jev') { send(res, 404, { error: 'not_found' }, origin); return; }
  if (origin && !ALLOWED.has(origin)) { send(res, 403, { error: 'origin_not_allowed' }, origin); return; }

  const now = Date.now();
  if (now - windowStart > 60_000) { windowStart = now; windowCount = 0; }
  if (++windowCount > PER_MINUTE) { send(res, 429, { error: 'rate_limited' }, origin); return; }

  let size = 0;
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY) { send(res, 413, { error: 'too_large' }, origin); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', async () => {
    let payload;
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')).payload; } catch { payload = null; }
    if (!payload || typeof payload.state !== 'string' || typeof payload.questions !== 'object') {
      send(res, 400, { error: 'expected { payload: { state, questions } }' }, origin);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const upstream = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, state: payload.state.slice(0, 2000), questions: payload.questions }),
        signal: controller.signal
      });
      send(res, upstream.status, await upstream.text(), origin);
    } catch {
      send(res, 502, { error: 'upstream_unreachable' }, origin);
    } finally {
      clearTimeout(timer);
    }
  });
}).listen(PORT, HOST, () => {
  console.log(`jev-proxy en http://${HOST}:${PORT}/jev · orígenes: ${[...ALLOWED].join(', ')}`);
});

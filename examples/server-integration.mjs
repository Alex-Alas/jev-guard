// INTEGRACIÓN RECOMENDADA: en el servidor del motor, justo antes de difundir
// por el WebSocket `/display`. Un solo punto protege el LED, la salida de vMix
// (/overlay?live=1) y la escucha móvil (/listen), incluida la lectura en voz alta.
//
// Este archivo es un ESQUEMA: los nombres `displayClients` y `broadcastToDisplays`
// representan lo que el motor ya tenga. Lo único que cambia es la línea marcada.

import { createCaptionGuard, createJevClient } from '../src/index.js';

const displayClients = new Set(); // sockets de /display que ya existen en el motor

function broadcastToDisplays(msg) {
  const data = JSON.stringify(msg);
  for (const ws of displayClients) {
    try { ws.send(data); } catch { /* el motor ya maneja sockets caídos */ }
  }
}

const guard = createCaptionGuard({
  jev: process.env.COMMAND_CODE_API_KEY
    ? createJevClient({ apiKey: process.env.COMMAND_CODE_API_KEY, timeoutMs: 1500 })
    : undefined, // sin key: modo solo-léxico (tapa todo lo marcado, sin correcciones)
  emit: broadcastToDisplays,
  holdSealMs: 900,
  // Si el motor conserva el texto en inglés del segmento, dárselo a Jev mejora mucho
  // la decisión («sheet» vs. grosería). Ajustar al nombre real del campo.
  getSource: (msg) => msg.sourceText,
  onEvent: (e) => {
    if (e.type === 'jev_error' || e.type === 'breaker_open' || e.type === 'guard_error') console.warn('[jev-guard]', e);
  }
});

// ANTES:  broadcastToDisplays(captionMsg)
// AHORA:  guard.push(captionMsg)
//
// Todo mensaje que vaya a /display puede pasar por el guard: los que no son
// `caption` salen intactos, y `clear` además reinicia su estado.
export function sendToDisplays(msg) {
  guard.push(msg);
}

// Telemetría para el panel del técnico (opcional): guard.stats()
export { guard };

// Elige el proveedor de Jev según las variables de entorno disponibles.
import { createJevClient, TYPESAFE_ENDPOINT, TYPESAFE_MODEL } from '../src/index.js';

export function jevFromEnv(extra = {}) {
  const ts = process.env.TYPESAFE_JEV_API_KEY || process.env.TYPESAFE_API_KEY;
  const cc = process.env.COMMAND_CODE_API_KEY || process.env.COMMAND_CODE_MAIN_API;
  if (ts) return { label: 'TypeSafe directo (jev-latest)', jev: createJevClient({ apiKey: ts, endpoint: TYPESAFE_ENDPOINT, model: TYPESAFE_MODEL, ...extra }) };
  if (cc) return { label: 'Command Code (typesafe/jev)', jev: createJevClient({ apiKey: cc, ...extra }) };
  return { label: null, jev: null };
}

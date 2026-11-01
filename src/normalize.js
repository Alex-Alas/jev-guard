// Normalización 1:1 por carácter. La salida tiene EXACTAMENTE la misma longitud
// que la entrada, así los offsets que encuentra el detector sirven para tapar
// el texto original sin recalcular nada.

const LEET = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's'
};

export function normalizeChar(ch) {
  const lower = ch.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(LEET, lower)) return LEET[lower];
  if (lower === 'ñ') return 'ñ';
  // Algunos caracteres (p. ej. «İ») se expanden al pasar a minúscula: se toma
  // solo la base para no romper la longitud.
  const base = lower.normalize('NFD').charAt(0);
  if (/[a-z]/.test(base)) return base;
  return lower.length === 1 ? lower : base || ch;
}

export function normalize(text) {
  const s = String(text ?? '');
  let out = '';
  for (let i = 0; i < s.length; i++) out += normalizeChar(s.charAt(i));
  return out;
}

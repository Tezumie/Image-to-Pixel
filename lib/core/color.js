// Colour helpers shared by the CPU path, the GPU uniforms and the editor.
// All channel values are sRGB in 0..1 unless a name says otherwise.

/** Parse '#rgb', '#rrggbb', '#rrggbbaa', 'rrggbb' or [r,g,b] (0..255) into [r, g, b] bytes. */
export function parseColor(c) {
  if (Array.isArray(c)) return [c[0] | 0, c[1] | 0, c[2] | 0];
  let s = String(c).trim().replace(/^#|^0x/i, '');
  if (s.length === 3 || s.length === 4) s = s.slice(0, 3).split('').map(ch => ch + ch).join('');
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s)) throw new Error(`Invalid colour "${c}"`);
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

/** True when `c` parses as a colour. */
export function isColor(c) {
  try { parseColor(c); return true; } catch { return false; }
}

/** [r, g, b] bytes → '#rrggbb'. */
export function toHex(rgb) {
  return '#' + rgb.slice(0, 3).map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/** Normalise any colour to '#rrggbb' (lower case). */
export const normHex = c => toHex(parseColor(c));

const lin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** sRGB (0..1) → OKLab [L, a, b]. Same maths as the GLSL `oklab()` in gpu/shaders.js. */
export function oklab(r, g, b) {
  r = lin(r); g = lin(g); b = lin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

/** Relative luminance-ish weight used by saturation (Rec. 709). */
export const LUMA = [0.2126, 0.7152, 0.0722];

/** Perceived lightness 0..1 of a hex colour; handy for picking text colours on swatches. */
export function lightness(hex) {
  const [r, g, b] = parseColor(hex);
  return oklab(r / 255, g / 255, b / 255)[0];
}

/**
 * Average distance (sRGB 0..1) from each palette colour to its nearest neighbour.
 * Ordered dithering scales its threshold by this so `strength` means the same thing
 * for a 2-colour and a 64-colour palette.
 */
export function paletteSpread(rgbs) {
  if (rgbs.length < 2) return 1;
  let sum = 0;
  for (let i = 0; i < rgbs.length; i++) {
    let best = Infinity;
    for (let j = 0; j < rgbs.length; j++) {
      if (i === j) continue;
      const dr = rgbs[i][0] - rgbs[j][0], dg = rgbs[i][1] - rgbs[j][1], db = rgbs[i][2] - rgbs[j][2];
      const d = Math.sqrt(dr * dr + dg * dg + db * db);
      if (d < best) best = d;
    }
    sum += best;
  }
  return Math.max(0.04, Math.min(1, sum / rgbs.length / 255));
}

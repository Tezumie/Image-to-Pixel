// GLSL (WebGL 2) for the GPU pipeline. Each pass mirrors a function in cpu/stages.js.
// ShaderMate adds the #version line, precision, fragColor and the built-in uniforms.
//
//   prep ─▶ quant ──────────────┐
//     └───▶ diffuse (N waves) ─▶ resolve ─▶ orphan ─▶ smooth ─▶ out (screen)
//
// Note: no trailing comments on uniform lines; ShaderMate reads trailing numbers there as default values.
// All passes address pixels top-down (`P`, row 0 = top) so the maths matches the CPU.

export const COMMON = /* glsl */`
// 256×1, palette colours in x = 0..count-1
uniform sampler2D u_palette;
uniform int u_count;
// 0 = OKLab, 1 = weighted RGB
uniform int u_distance;

ivec2 topDown() { return ivec2(int(gl_FragCoord.x), int(u_resolution.y) - 1 - int(gl_FragCoord.y)); }
vec4 at(sampler2D t, ivec2 p) { ivec2 s = textureSize(t, 0); return texelFetch(t, ivec2(p.x, s.y - 1 - p.y), 0); }
bool inside(ivec2 p) { return p.x >= 0 && p.y >= 0 && p.x < int(u_resolution.x) && p.y < int(u_resolution.y); }
vec3 palColor(int i) { return texelFetch(u_palette, ivec2(i, 0), 0).rgb; }

float linear1(float c) { return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
vec3 oklab(vec3 c) {
  c = vec3(linear1(c.r), linear1(c.g), linear1(c.b));
  float l = pow(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b, 1.0 / 3.0);
  float m = pow(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b, 1.0 / 3.0);
  float s = pow(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b, 1.0 / 3.0);
  return vec3(0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
              1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
              0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}
vec3 space(vec3 c) { return u_distance == 1 ? c : oklab(c); }
int nearestIndex(vec3 c) {
  vec3 p = space(c);
  vec3 w = u_distance == 1 ? vec3(0.299, 0.587, 0.114) : vec3(1.0);
  int best = 0; float bd = 1e20;
  for (int i = 0; i < 256; i++) {
    if (i >= u_count) break;
    vec3 d = p - space(palColor(i));
    float dist = dot(w * d, d);
    if (dist < bd) { bd = dist; best = i; }
  }
  return best;
}
int colorKey(vec4 c) {
  if (c.a < 0.5) return -1;
  ivec3 b = ivec3(floor(c.rgb * 255.0 + 0.5));
  return b.r * 65536 + b.g * 256 + b.b;
}
`;

/** Resample (box / nearest) + adjust + alpha cut. iChannel0 = source image. */
export const PREP = /* glsl */`
// 0 box, 1 nearest
uniform int u_resample;
// brightness, contrast, saturation, gamma
uniform vec4 u_adjust;
// hue rotation in degrees
uniform float u_hue;
uniform float u_alphaCut;
// source region in texels: x, y (from the top-left), width, height
uniform ivec4 u_crop;

void main() {
  ivec2 P = topDown();
  ivec2 R = ivec2(u_resolution);
  ivec2 O = u_crop.xy;
  ivec2 S = u_crop.zw;
  int nx = u_resample == 1 ? 1 : clamp((S.x + R.x - 1) / R.x, 1, 16);
  int ny = u_resample == 1 ? 1 : clamp((S.y + R.y - 1) / R.y, 1, 16);
  vec4 acc = vec4(0.0);
  for (int j = 0; j < 16; j++) {
    if (j >= ny) break;
    int sy = min(S.y - 1, ((2 * (P.y * ny + j) + 1) * S.y) / (2 * R.y * ny));
    for (int i = 0; i < 16; i++) {
      if (i >= nx) break;
      int sx = min(S.x - 1, ((2 * (P.x * nx + i) + 1) * S.x) / (2 * R.x * nx));
      vec4 c = at(iChannel0, O + ivec2(sx, sy));
      acc += vec4(c.rgb * c.a, c.a);
    }
  }
  vec3 c = acc.a > 0.0 ? acc.rgb / acc.a : vec3(0.0);
  float a = acc.a / float(nx * ny);

  float br = u_adjust.x, co = u_adjust.y, sa = u_adjust.z, ga = u_adjust.w;
  if (br != 0.0 || co != 0.0 || sa != 0.0 || ga != 1.0 || u_hue != 0.0) {
    float f = co >= 0.0 ? 1.0 / (1.0 - 0.99 * co) : 1.0 + co;
    c = (c + br - 0.5) * f + 0.5;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = l + (c - l) * (1.0 + sa);
    if (u_hue != 0.0) {
      float h = radians(u_hue), k = cos(h), q = sin(h);
      c = vec3(
        (0.213 + 0.787 * k - 0.213 * q) * c.r + (0.715 - 0.715 * k - 0.715 * q) * c.g + (0.072 - 0.072 * k + 0.928 * q) * c.b,
        (0.213 - 0.213 * k + 0.143 * q) * c.r + (0.715 + 0.285 * k + 0.140 * q) * c.g + (0.072 - 0.072 * k - 0.283 * q) * c.b,
        (0.213 - 0.213 * k - 0.787 * q) * c.r + (0.715 - 0.715 * k + 0.715 * q) * c.g + (0.072 + 0.928 * k + 0.072 * q) * c.b);
    }
    c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / ga));
  }
  a = (a >= u_alphaCut && a > 0.0) ? 1.0 : 0.0;
  fragColor = vec4(c * a, a);
}
`;

/** No dither / ordered dither. iChannel0 = prep. */
export const QUANT = /* glsl */`
// threshold bytes in .r
uniform sampler2D u_matrix;
// 0 pass-through, 1 nearest, 2 ordered
uniform int u_mode;
uniform float u_levels;
// spread × strength
uniform float u_amount;

void main() {
  ivec2 P = topDown();
  vec4 p = at(iChannel0, P);
  if (p.a < 0.5) { fragColor = vec4(0.0); return; }
  vec3 c = p.rgb;
  if (u_mode == 0) { fragColor = vec4(floor(c * 255.0 + 0.5) / 255.0, 1.0); return; }
  if (u_mode == 2) {
    ivec2 ms = textureSize(u_matrix, 0);
    float v = floor(at(u_matrix, ivec2(P.x % ms.x, P.y % ms.y)).r * 255.0 + 0.5);
    float t = (v + 0.5) / u_levels - 0.5;
    c = clamp(c + t * u_amount, 0.0, 1.0);
  }
  fragColor = vec4(palColor(nearestIndex(c)), 1.0);
}
`;

/**
 * Error diffusion as a wavefront. Iteration r computes every pixel with x + skew*y == r,
 * pulling the stored error of already-computed neighbours.
 * Output: rgb = quantisation error, a = palette index (-1 not yet computed, -2 transparent).
 * iChannel0 = prep, iChannel1 = this pass (previous iteration).
 */
export const DIFFUSE = /* glsl */`
// iteration index, set by ShaderMate for passes with iterations (declared here: a FragCoord.xyz built-in)
uniform int u_recursion;
uniform int u_on;
uniform int u_skew;
uniform float u_strength;
uniform int u_kn;
// push offsets (dx, dy) and weight
uniform vec3 u_kernel[12];

void main() {
  if (u_on == 0) { fragColor = vec4(0.0, 0.0, 0.0, -1.0); return; }
  ivec2 P = topDown();
  int k = P.x + u_skew * P.y;
  int r = u_recursion;
  if (k < r) { fragColor = at(iChannel1, P); return; }
  if (k > r) { fragColor = vec4(0.0, 0.0, 0.0, -1.0); return; }
  vec4 p = at(iChannel0, P);
  if (p.a < 0.5) { fragColor = vec4(0.0, 0.0, 0.0, -2.0); return; }
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    if (i >= u_kn) break;
    ivec2 Q = P - ivec2(u_kernel[i].xy);
    if (!inside(Q)) continue;
    vec4 e = at(iChannel1, Q);
    if (e.a >= 0.0) acc += e.rgb * u_kernel[i].z;
  }
  vec3 c = clamp(p.rgb + acc * u_strength, 0.0, 1.0);
  int idx = nearestIndex(c);
  fragColor = vec4(c - palColor(idx), float(idx));
}
`;

/** Pick the ordered result or turn diffusion indices into colours. iChannel0 = quant, iChannel1 = diffuse. */
export const RESOLVE = /* glsl */`
uniform int u_on;
void main() {
  ivec2 P = topDown();
  if (u_on == 0) { fragColor = at(iChannel0, P); return; }
  vec4 d = at(iChannel1, P);
  fragColor = d.a < 0.0 ? vec4(0.0) : vec4(palColor(int(d.a + 0.5)), 1.0);
}
`;

/** Orphan removal. iChannel0 = resolve. */
export const ORPHAN = /* glsl */`
uniform int u_on;
void main() {
  ivec2 P = topDown();
  vec4 me = at(iChannel0, P);
  fragColor = me;
  if (u_on == 0) return;
  int c = colorKey(me);
  ivec2 off[4] = ivec2[4](ivec2(0, -1), ivec2(1, 0), ivec2(0, 1), ivec2(-1, 0));
  int ks[4]; vec4 cs[4]; int n = 0;
  for (int i = 0; i < 4; i++) {
    ivec2 Q = P + off[i];
    if (!inside(Q)) continue;
    cs[n] = at(iChannel0, Q); ks[n] = colorKey(cs[n]);
    if (ks[n] == c) return;
    n++;
  }
  if (n < 2) return;
  int best = 0, bc = 0;
  for (int i = 0; i < 4; i++) {
    if (i >= n) break;
    int m = 0;
    for (int j = 0; j < 4; j++) { if (j >= n) break; if (ks[j] == ks[i]) m++; }
    if (m > bc) { bc = m; best = i; }
  }
  fragColor = cs[best];
}
`;

/** 3×3 majority smoothing. iChannel0 = orphan. */
export const SMOOTH = /* glsl */`
uniform int u_on;
void main() {
  ivec2 P = topDown();
  vec4 me = at(iChannel0, P);
  fragColor = me;
  if (u_on == 0) return;
  int c = colorKey(me);
  ivec2 R = ivec2(u_resolution);
  int ks[9]; vec4 cs[9];
  for (int j = 0; j < 3; j++) for (int i = 0; i < 3; i++) {
    ivec2 Q = clamp(P + ivec2(i - 1, j - 1), ivec2(0), R - 1);
    cs[j * 3 + i] = at(iChannel0, Q); ks[j * 3 + i] = colorKey(cs[j * 3 + i]);
  }
  for (int i = 0; i < 9; i++) {
    if (ks[i] == c) continue;
    int m = 0;
    for (int j = 0; j < 9; j++) if (ks[j] == ks[i]) m++;
    if (m >= 5) { fragColor = cs[i]; return; }
  }
}
`;

/** Outline, drawn to the canvas. iChannel0 = smooth. */
export const OUTLINE = /* glsl */`
// 0 none, 1 outer, 2 inner
uniform int u_outline;
uniform int u_corners;
uniform vec3 u_outlineColor;
bool opaqueAt(ivec2 q) { return inside(q) && at(iChannel0, q).a > 0.5; }
void main() {
  ivec2 P = topDown();
  vec4 me = at(iChannel0, P);
  fragColor = me;
  if (u_outline == 0) return;
  bool o = me.a > 0.5;
  ivec2 off[8] = ivec2[8](ivec2(0, -1), ivec2(1, 0), ivec2(0, 1), ivec2(-1, 0), ivec2(-1, -1), ivec2(1, -1), ivec2(1, 1), ivec2(-1, 1));
  int n = u_corners == 1 ? 8 : 4;
  for (int i = 0; i < 8; i++) {
    if (i >= n) break;
    ivec2 Q = P + off[i];
    if (!inside(Q)) continue;
    bool other = opaqueAt(Q);
    if (u_outline == 1 ? (!o && other) : (o && !other)) { fragColor = vec4(u_outlineColor, 1.0); return; }
  }
}
`;

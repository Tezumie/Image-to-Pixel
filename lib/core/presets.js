// Built-in presets: partial settings applied on top of the defaults.

export const PRESETS = [
  {
    id: 'balanced', name: 'Balanced', description: 'Endesga 32, Bayer 4×4. A good first look at most photos.',
    settings: { size: { width: 96 }, palette: { source: 'builtin', id: 'endesga-32' }, dither: { method: 'bayer4', strength: 0.6 } },
  },
  {
    id: 'game-boy', name: 'Game Boy', description: 'Four greens, 160 px wide, ordered dither.',
    settings: { size: { width: 160 }, palette: { source: 'builtin', id: 'game-boy-dmg' }, dither: { method: 'bayer4', strength: 1 }, adjust: { contrast: 0.15 } },
  },
  {
    id: 'pico-8', name: 'PICO-8', description: '128 px, the PICO-8 palette, blue-noise dither.',
    settings: { size: { width: 128 }, palette: { source: 'builtin', id: 'pico-8' }, dither: { method: 'bluenoise', strength: 0.7 } },
  },
  {
    id: 'one-bit', name: '1-bit Atkinson', description: 'Classic Mac look: two colours, Atkinson diffusion.',
    settings: { size: { width: 192 }, palette: { source: 'builtin', id: '1-bit-monitor' }, dither: { method: 'atkinson', strength: 1 }, adjust: { contrast: 0.2 } },
  },
  {
    id: 'faithful', name: 'Faithful colour', description: 'Palette extracted from the image, Floyd–Steinberg.',
    settings: { size: { width: 128 }, palette: { source: 'extract', count: 24 }, dither: { method: 'floyd-steinberg', strength: 0.75 } },
  },
  {
    id: 'sprite', name: 'Clean sprite', description: 'No dither, nearest resample, orphan cleanup and a dark outline. For art with transparency.',
    settings: { size: { width: 48, resample: 'nearest' }, palette: { source: 'extract', count: 12 }, dither: { method: 'none' }, cleanup: { orphans: true }, outline: { mode: 'outer', color: '#1a1c2c' } },
  },
  {
    id: 'cga', name: 'CGA', description: '16 hard colours with an 8×8 Bayer pattern.',
    settings: { size: { width: 160 }, palette: { source: 'builtin', id: 'cga-16' }, dither: { method: 'bayer8', strength: 1 } },
  },
  {
    id: 'newsprint', name: 'Newsprint', description: 'Grey clustered-dot halftone.',
    settings: { size: { width: 220 }, palette: { source: 'builtin', id: 'grayscale-4' }, dither: { method: 'cluster8', strength: 1 }, adjust: { saturation: -1 } },
  },
  {
    id: 'soft', name: 'Soft painterly', description: 'Resurrect 64 with Sierra Lite and a light smooth.',
    settings: { size: { width: 112 }, palette: { source: 'builtin', id: 'resurrect-64' }, dither: { method: 'sierra-lite', strength: 0.6 }, cleanup: { smooth: true } },
  },
];

export const getPreset = id => PRESETS.find(p => p.id === id) || null;

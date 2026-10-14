// Examples gallery: render each card's thumbnail live with the engine.
import { createPixelator, mergeSettings, defaultSettings } from '../../lib/index.js';
import { SAMPLES, loadSample } from '../../lib/editor/samples.js';

const cards = [...document.querySelectorAll('canvas.ex-thumb')];
if (cards.length) {
  const engine = await createPixelator();
  const images = new Map();
  for (const c of cards) {
    const id = c.dataset.sample || 'dusk';
    if (!images.has(id)) images.set(id, await loadSample(SAMPLES.find(s => s.id === id) || SAMPLES[0]));
    let preview = {};
    try { preview = JSON.parse(c.dataset.preset || '{}'); } catch { /* keep defaults */ }
    const s = mergeSettings(mergeSettings(defaultSettings(), preview), { size: { mode: 'width', width: 80, height: 60 } });
    const r = await engine.process(images.get(id), s);
    r.toCanvas(1, { canvas: c });
  }
}

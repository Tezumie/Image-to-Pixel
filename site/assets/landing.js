// Landing page demo: the real engine on a sample image, with a before/after slider.
import { createPixelator, mergeSettings, defaultSettings, getPreset } from '../../lib/index.js';
import { SAMPLES, loadSample } from '../../lib/editor/samples.js';

const LOOKS = ['faithful', 'pico-8', 'game-boy', 'one-bit', 'cga', 'balanced'];
const stage = document.getElementById('demo-stage');
const bar = document.getElementById('demo-bar');
const pxCanvas = document.getElementById('demo-px');
const orig = document.getElementById('demo-orig');

async function main() {
  const img = await loadSample(SAMPLES[0]);
  const engine = await createPixelator();

  // original, drawn once at the stage's resolution
  const fitTo = c => { const r = stage.getBoundingClientRect(); c.width = Math.round(r.width * devicePixelRatio); c.height = Math.round(r.height * devicePixelRatio); };
  const drawOriginal = () => {
    fitTo(orig);
    const g = orig.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, orig.width, orig.height);
  };
  drawOriginal();

  const meta = document.createElement('span');
  meta.className = 'demo-meta';
  const chips = LOOKS.map(id => {
    const p = getPreset(id);
    const s = mergeSettings(defaultSettings(), p.settings);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.setAttribute('aria-pressed', 'false');
    b.title = p.description;
    const sw = document.createElement('span'); sw.className = 'sw';
    for (const c of (s.palette.colors.length ? s.palette.colors : ['#7a5c8f', '#e0766a', '#f6c27a', '#2d2147']).slice(0, 6)) { const i = document.createElement('i'); i.style.background = c; sw.append(i); }
    b.append(sw, document.createTextNode(p.name));
    b.addEventListener('click', () => show(id));
    bar.append(b);
    return { id, b, s };
  });
  bar.append(meta);

  async function show(id) {
    const c = chips.find(x => x.id === id);
    chips.forEach(x => x.b.setAttribute('aria-pressed', String(x === c)));
    const s = mergeSettings(c.s, { size: { width: Math.min(c.s.size.width, 128) } });
    const r = await engine.process(img, s);
    r.toCanvas(1, { canvas: pxCanvas });
    meta.textContent = `${r.width} × ${r.height}, ${r.usedColors().length} colours, ${Math.round(r.ms)} ms`;
  }

  // drag to compare
  const setSplit = x => { const r = stage.getBoundingClientRect(); stage.style.setProperty('--split', `${Math.min(100, Math.max(0, (x - r.left) / r.width * 100))}%`); };
  stage.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons) setSplit(e.clientX); });
  stage.addEventListener('pointerdown', e => setSplit(e.clientX));
  stage.addEventListener('pointerleave', () => stage.style.setProperty('--split', '50%'));
  new ResizeObserver(drawOriginal).observe(stage);

  await show('faithful');
}

main().catch(err => {
  bar.textContent = `The live demo needs a current browser (${err.message}).`;
});

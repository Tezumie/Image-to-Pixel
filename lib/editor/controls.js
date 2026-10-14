// Inspector controls. Each returns { el, set(value) } so the inspector can sync from state
// without rebuilding (which would steal focus mid-drag).

import { h, nextId } from './dom.js';
import { icon } from './icons.js';

/**
 * Collapsible inspector section: a header button (works the same in every browser, unlike
 * <details>) plus an optional reset icon that appears when the section differs from its defaults.
 * @param {string} title
 * @param {{ open?: boolean, onToggle?: (open: boolean) => void, onReset?: () => void, resetLabel?: string }} opts
 */
export function section(title, opts = {}, ...children) {
  const id = nextId('sec');
  const hintEl = h('span.hint', {});
  const toggle = h('button.itp-sec-toggle', { type: 'button', 'aria-controls': id },
    h('span.title', { text: title }), hintEl, h('span.chev', { html: icon('chevron') }));
  const reset = opts.onReset ? h('button.itp-btn.small.icon.itp-sec-reset', {
    type: 'button', hidden: true, title: opts.resetLabel || `Reset ${title.toLowerCase()}`, 'aria-label': opts.resetLabel || `Reset ${title.toLowerCase()} to defaults`,
    html: icon('reset'), onclick: () => opts.onReset(),
  }) : null;
  const body = h('div.body', { id }, ...children);
  const el = h('section.itp-sec', {}, h('div.itp-sec-head', {}, toggle, reset), body);
  const setOpen = open => {
    el.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    body.hidden = !open;
  };
  toggle.addEventListener('click', () => { const open = el.dataset.open !== 'true'; setOpen(open); opts.onToggle?.(open); });
  setOpen(opts.open !== false);
  return {
    el, body,
    setHint(t) { hintEl.textContent = t; },
    /** Show the reset icon when the section's settings differ from the defaults. */
    setChanged(changed) { if (reset) reset.hidden = !changed; },
    setOpen,
    get open() { return el.dataset.open === 'true'; },
  };
}

/** Labelled field wrapper. */
export function field(label, control, { help = '', value = null, id } = {}) {
  const lab = h('div.lab', {}, h('label', { for: id || control.id || null, text: label }), value);
  return h('div.itp-field', {}, lab, control, help ? h('div.help', { text: help }) : null);
}

/**
 * Slider + number box.
 * @param {{ label: string, min: number, max: number, step?: number, value: number, unit?: string,
 *           scale?: number, help?: string, onInput: (v:number)=>void, onCommit?: ()=>void }} o
 *   scale: display multiplier (0..1 shown as 0..100 with scale 100)
 */
export function slider(o) {
  const id = nextId('sl');
  const k = o.scale || 1;
  const step = o.step || 1;
  const range = h('input', { type: 'range', id, min: o.min * k, max: o.max * k, step: step * k, 'aria-label': o.label });
  const num = h('input.itp-input', { type: 'number', min: o.min * k, max: o.max * k, step: step * k, 'aria-label': `${o.label} value` });
  const paint = () => { const p = (range.value - range.min) / (range.max - range.min) * 100; range.style.setProperty('--p', `${p}%`); };
  const set = v => { const d = round(v * k, step * k); range.value = d; num.value = d; paint(); };
  range.addEventListener('input', () => { num.value = range.value; paint(); o.onInput(Number(range.value) / k); });
  range.addEventListener('change', () => o.onCommit && o.onCommit());
  num.addEventListener('change', () => {
    const v = Math.min(o.max * k, Math.max(o.min * k, Number(num.value) || 0));
    set(v / k); o.onInput(v / k); o.onCommit && o.onCommit();
  });
  range.addEventListener('dblclick', () => { if (o.reset != null) { set(o.reset); o.onInput(o.reset); o.onCommit && o.onCommit(); } });
  set(o.value);
  const el = field(o.label, h('div.itp-slider', {}, range, num), { help: o.help, id });
  return { el, set, input: range };
}

const round = (v, step) => {
  const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return Number((Math.round(v / step) * step).toFixed(d));
};

/** <select> with options [{ value, label, group? }]. */
export function select(o) {
  const id = nextId('se');
  const el = h('select.itp-select', { id, 'aria-label': o.label });
  const groups = new Map();
  for (const opt of o.options) {
    const node = h('option', { value: opt.value, text: opt.label });
    if (opt.group) {
      if (!groups.has(opt.group)) { const g = h('optgroup', { label: opt.group }); groups.set(opt.group, g); el.append(g); }
      groups.get(opt.group).append(node);
    } else el.append(node);
  }
  el.addEventListener('change', () => o.onChange(el.value));
  const wrapped = o.bare ? el : field(o.label, el, { help: o.help, id });
  return { el: wrapped, select: el, set(v) { el.value = v; } };
}

/** Segmented toggle [{ value, label, icon?, title? }]. */
export function segmented(o) {
  const btns = o.options.map(opt => h('button', {
    type: 'button', 'aria-pressed': 'false', title: opt.title || null,
    html: (opt.icon ? icon(opt.icon) : '') + (opt.label ? `<span>${opt.label}</span>` : ''),
    onclick: () => o.onChange(opt.value),
  }));
  const seg = h('div.itp-seg', { role: 'group', 'aria-label': o.label }, ...btns);
  const set = v => btns.forEach((b, i) => b.setAttribute('aria-pressed', String(o.options[i].value === v)));
  set(o.value);
  const el = o.bare ? seg : field(o.label, seg, { help: o.help });
  return { el, set };
}

/** On/off switch. */
export function toggle(o) {
  const input = h('input', { type: 'checkbox', role: 'switch' });
  input.addEventListener('change', () => o.onChange(input.checked));
  const lab = h('label.itp-switch', {}, h('span', { text: o.label }), input);
  const el = o.help ? h('div.itp-field', {}, lab, h('div.help', { text: o.help })) : lab;
  return { el, set(v) { input.checked = !!v; } };
}

/** Colour input with hex readout. */
export function colorInput(o) {
  const input = h('input', { type: 'color', 'aria-label': o.label });
  const hex = h('span.mono', {});
  input.addEventListener('input', () => { hex.textContent = input.value; o.onChange(input.value); });
  const box = h('label.itp-color', {}, input, hex);
  const set = v => { input.value = v; hex.textContent = v; };
  set(o.value || '#000000');
  return { el: o.bare ? box : field(o.label, box), set };
}

/** Number box (no slider). */
export function numberInput(o) {
  const id = nextId('nu');
  const input = h('input.itp-input.num', { type: 'number', id, min: o.min, max: o.max, step: o.step || 1, 'aria-label': o.label });
  input.addEventListener('change', () => {
    const v = Math.min(o.max, Math.max(o.min, Number(input.value) || o.min));
    if (input.value !== '' || !input.placeholder) input.value = v;
    o.onChange(v);
  });
  return { el: o.bare ? input : field(o.label, input, { help: o.help, id }), input, set(v) { input.value = v; } };
}

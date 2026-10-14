// Tiny DOM helpers. No framework: the editor is small enough to wire by hand.

/** Create an element: h('button.itp-btn.icon', { onclick, title }, child…) */
export function h(tag, props = {}, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string' && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Replace all children. */
export function render(el, ...children) { el.replaceChildren(); return append(el, children); }

export const $ = (sel, root = document) => root.querySelector(sel);

/** Element from an HTML string (single root). */
export function html(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let uid = 0;
export const nextId = (p = 'itp') => `${p}-${++uid}`;

/** Debounce helper. */
export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Read a File as text. */
export const readText = file => file.text();

/** Open a file picker and resolve with the chosen files. */
export function pickFiles({ accept = '', multiple = false } = {}) {
  return new Promise(res => {
    const input = h('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    input.addEventListener('change', () => { res([...input.files]); input.remove(); });
    input.addEventListener('cancel', () => { res([]); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

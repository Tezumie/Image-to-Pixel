// Menus, dialogs and toasts.

import { h, render } from './dom.js';
import { icon } from './icons.js';

let toastHost = null;
const host = () => (toastHost ||= document.body.appendChild(h('div.itp-toasts.itp', { role: 'status', 'aria-live': 'polite' })));

/**
 * Show a toast. Returns { update(msg), progress(0..1), close() }.
 * @param {string} msg
 * @param {{ kind?: 'info'|'ok'|'error', timeout?: number, action?: { label, onClick }, progress?: boolean, onCancel?: () => void }} [o]
 */
export function toast(msg, o = {}) {
  const kind = o.kind || 'info';
  const text = h('div.msg', {}, h('div', { text: msg }));
  const bar = o.progress ? h('div.itp-progress', {}, h('i')) : null;
  if (bar) text.append(bar);
  const el = h(`div.itp-toast.${kind}`, {}, o.progress ? h('div.itp-spinner') : h('span.itp-dot'), text);
  if (o.action) el.append(h('button.itp-btn.small.outline', { type: 'button', text: o.action.label, onclick: () => { o.action.onClick(); close(); } }));
  if (o.onCancel) el.append(h('button.itp-btn.small', { type: 'button', text: 'Cancel', onclick: () => { o.onCancel(); close(); } }));
  else el.append(h('button.itp-btn.small.icon', { type: 'button', 'aria-label': 'Dismiss', html: icon('x'), onclick: () => close() }));
  host().append(el);
  let timer = null;
  const close = () => { clearTimeout(timer); el.remove(); };
  const arm = ms => { clearTimeout(timer); if (ms) timer = setTimeout(close, ms); };
  arm(o.timeout ?? (o.progress ? 0 : kind === 'error' ? 7000 : 3200));
  return {
    update(m) { text.firstChild.textContent = m; },
    progress(p) { if (bar) bar.firstChild.style.width = `${Math.round(p * 100)}%`; },
    close,
    done(m, k = 'ok') { close(); toast(m, { kind: k }); },
  };
}

let openMenu = null;
/**
 * Popover menu anchored to a button.
 * items: [{ label, sub?, icon?, kbd?, onClick, disabled? } | 'sep' | { group: 'Label' }]
 */
export function menu(anchor, items, { align = 'end' } = {}) {
  closeMenu();
  const el = h('div.itp-menu.itp', { role: 'menu' });
  for (const it of items) {
    if (it === 'sep') { el.append(h('hr')); continue; }
    if (it.group) { el.append(h('div.mlabel', { text: it.group })); continue; }
    const b = h('button.mi', { type: 'button', role: 'menuitem', disabled: !!it.disabled },
      h('span', { html: it.icon ? icon(it.icon) : '' }),
      h('span', {}, it.label, it.sub ? h('small', { text: it.sub }) : null),
      it.kbd ? h('kbd', { text: it.kbd }) : h('span'));
    b.addEventListener('click', () => { closeMenu(); it.onClick(); });
    el.append(b);
  }
  document.body.append(el);
  const r = anchor.getBoundingClientRect();
  const mw = el.offsetWidth, mh = el.offsetHeight;
  let left = align === 'end' ? r.right - mw : r.left;
  left = Math.max(8, Math.min(left, innerWidth - mw - 8));
  let top = r.bottom + 6;
  if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 6);
  Object.assign(el.style, { left: `${left}px`, top: `${top}px` });
  anchor.setAttribute('aria-expanded', 'true');
  const buttons = [...el.querySelectorAll('button.mi:not(:disabled)')];
  buttons[0]?.focus();
  const onKey = e => {
    const i = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(); anchor.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); buttons[(i + 1) % buttons.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length]?.focus(); }
    else if (e.key === 'Tab') closeMenu();
  };
  const onDown = e => { if (!el.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) closeMenu(); };
  el.addEventListener('keydown', onKey);
  setTimeout(() => document.addEventListener('pointerdown', onDown, true));
  openMenu = { el, anchor, cleanup: () => document.removeEventListener('pointerdown', onDown, true) };
}
export function closeMenu() {
  if (!openMenu) return;
  openMenu.cleanup(); openMenu.el.remove(); openMenu.anchor.setAttribute('aria-expanded', 'false');
  openMenu = null;
}

/** Modal dialog. Returns the <dialog>; content can be updated with render(). */
export function dialog(title, content, { actions = [], onClose } = {}) {
  const body = h('div.content', {}, content);
  const d = h('dialog.itp-dialog.itp', { 'aria-label': title },
    h('header', {}, h('h2', { text: title }), h('button.itp-btn.icon', { type: 'button', 'aria-label': 'Close', html: icon('x'), onclick: () => d.close() })),
    body,
    actions.length ? h('footer', {}, ...actions.map(a => h(`button.itp-btn${a.primary ? '.primary' : '.outline'}`, { type: 'button', text: a.label, onclick: async () => { if ((await a.onClick?.()) !== false) d.close(); } }))) : null,
  );
  d.addEventListener('close', () => { d.remove(); onClose?.(); });
  document.body.append(d);
  d.showModal();
  d.body = body;
  d.setContent = (...c) => render(body, ...c);
  return d;
}

// Palette file formats. Every parser returns { name, colors: ['#rrggbb', …] }.
//
//   .gpl   GIMP / Aseprite / Krita palette
//   .hex   one hex colour per line (Lospec "HEX file")
//   .txt   Paint.NET palette (AARRGGBB per line, ';' comments)
//   .pal   JASC-PAL (Paint Shop Pro, Aseprite export)
//   .json  Lospec JSON ({ name, colors: ['rrggbb'] }), this tool's own export, or a plain array
//   anything else: every #hex / 6-digit token found in the text

import { normHex } from '../color.js';

const dedupe = list => [...new Set(list)];

export function parseGPL(text) {
  const lines = text.split(/\r?\n/);
  if (!/^GIMP Palette/i.test(lines[0] || '')) throw new Error('Not a GIMP palette (missing "GIMP Palette" header)');
  let name = '';
  const colors = [];
  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const nm = /^Name:\s*(.*)$/i.exec(line);
    if (nm) { name = nm[1].trim(); continue; }
    if (/^Columns:/i.test(line)) continue;
    const m = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/.exec(line);
    if (m) colors.push(normHex([+m[1], +m[2], +m[3]]));
  }
  return { name, colors };
}

export function parseHexList(text) {
  const colors = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('//')) continue;
    const m = /^#?([0-9a-f]{6}|[0-9a-f]{8}|[0-9a-f]{3})\b/i.exec(line);
    if (!m) continue;
    // 8 digits in a .txt palette are AARRGGBB (Paint.NET); in a .hex file they are rare, treat the same
    const h = m[1].length === 8 ? m[1].slice(2) : m[1];
    colors.push(normHex(h));
  }
  return { name: '', colors };
}

export function parseJASC(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim());
  if (lines[0] !== 'JASC-PAL') throw new Error('Not a JASC palette');
  const n = parseInt(lines[2], 10) || 0;
  const colors = [];
  for (let i = 3; i < 3 + n && i < lines.length; i++) {
    const m = /^(\d+)\s+(\d+)\s+(\d+)/.exec(lines[i]);
    if (m) colors.push(normHex([+m[1], +m[2], +m[3]]));
  }
  return { name: '', colors };
}

export function parseJSON(text) {
  const obj = typeof text === 'string' ? JSON.parse(text) : text;
  const list = Array.isArray(obj) ? obj : (obj.colors || obj.palette || []);
  const colors = list.map(c => (typeof c === 'object' && c ? (c.hex || c.color) : c)).filter(Boolean).map(normHex);
  return { name: (!Array.isArray(obj) && obj.name) || '', colors };
}

/** Pull every hex-looking token out of free text (pasted CSS, a tweet, a Lospec page). */
export function parseLoose(text) {
  const colors = [];
  const re = /#?\b([0-9a-f]{6})\b/gi;
  let m;
  while ((m = re.exec(text))) colors.push(normHex(m[1]));
  return { name: '', colors };
}

/**
 * Parse palette text by file name / content sniffing.
 * @param {string} text
 * @param {string} [filename]
 * @returns {{ name: string, colors: string[] }}
 */
export function parsePalette(text, filename = '') {
  const ext = (/\.([a-z0-9]+)$/i.exec(filename) || [])[1]?.toLowerCase() || '';
  const t = String(text).replace(/^﻿/, '');
  const trimmed = t.trim();
  let out;
  if (ext === 'gpl' || /^GIMP Palette/i.test(trimmed)) out = parseGPL(trimmed);
  else if (ext === 'pal' || trimmed.startsWith('JASC-PAL')) out = parseJASC(trimmed);
  else if (ext === 'json' || trimmed.startsWith('{') || trimmed.startsWith('[')) out = parseJSON(trimmed);
  else if (ext === 'hex' || ext === 'txt') out = parseHexList(trimmed);
  else {
    out = parseHexList(trimmed);
    if (!out.colors.length) out = parseLoose(trimmed);
  }
  out.colors = dedupe(out.colors).slice(0, 256);
  if (!out.name && filename) out.name = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
  if (!out.colors.length) throw new Error('No colours found in that palette');
  return out;
}

/** Palette → .gpl text. */
export function toGPL(name, colors) {
  const rows = colors.map(c => {
    const h = normHex(c);
    const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
    return `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${h.slice(1)}`;
  });
  return `GIMP Palette\nName: ${name || 'Palette'}\nColumns: 8\n#\n${rows.join('\n')}\n`;
}

/** Palette → .hex text. */
export const toHexFile = colors => colors.map(c => normHex(c).slice(1)).join('\n') + '\n';

/** Palette → JSON text (Lospec-compatible shape). */
export const toPaletteJSON = (name, colors) => JSON.stringify({ name: name || 'Palette', colors: colors.map(c => normHex(c).slice(1)) }, null, 2);

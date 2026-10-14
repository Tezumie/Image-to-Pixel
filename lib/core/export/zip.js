// Store-only zip writer (PNGs and GIFs are already compressed, so deflating again buys little).

import { crc32 } from './crc32.js';

const enc = new TextEncoder();

/**
 * @param {{ name: string, data: Uint8Array | string, date?: Date }[]} entries
 * @returns {Uint8Array}
 */
export function createZip(entries) {
  const files = [], central = [];
  let offset = 0;
  const used = new Set();
  for (const e of entries) {
    let name = e.name.replace(/\\/g, '/').replace(/^\/+/, '');
    // avoid duplicate names inside one archive
    if (used.has(name)) { const m = /^(.*?)(\.[^.]*)?$/.exec(name); let i = 2; while (used.has(`${m[1]}-${i}${m[2] || ''}`)) i++; name = `${m[1]}-${i}${m[2] || ''}`; }
    used.add(name);
    const nameBytes = enc.encode(name);
    const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    const crc = crc32(data);
    const d = e.date || new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);   // UTF-8 names
    lv.setUint16(8, 0, true); lv.setUint16(10, time, true); lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true); lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true); cv.setUint16(12, time, true); cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true); cv.setUint32(42, offset, true);
    cen.set(nameBytes, 46);

    files.push(local, data); central.push(cen);
    offset += local.length + data.length;
  }
  const cenSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cenSize, true); ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cenSize + 22);
  let o = 0;
  for (const p of [...files, ...central, end]) { out.set(p, o); o += p.length; }
  return out;
}

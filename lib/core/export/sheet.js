// Sprite sheets (many frames → one image + atlas JSON) and tilesets (one image → unique tiles + map).

const blank = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });

function blit(dst, src, dx, dy, sx = 0, sy = 0, sw = src.width, sh = src.height) {
  for (let y = 0; y < sh; y++) {
    const so = ((sy + y) * src.width + sx) * 4, o = ((dy + y) * dst.width + dx) * 4;
    dst.data.set(src.data.subarray ? src.data.subarray(so, so + sw * 4) : Array.prototype.slice.call(src.data, so, so + sw * 4), o);
  }
}

/**
 * Pack frames into a grid. Frames may differ in size; cells use the largest frame.
 * @param {{ width: number, height: number, data: ArrayLike<number>, name?: string, delay?: number }[]} frames
 * @param {{ columns?: number, padding?: number, name?: string }} [opts] columns: 0 = roughly square
 * @returns {{ image: { width, height, data }, atlas: object }}
 */
export function packSpriteSheet(frames, opts = {}) {
  if (!frames.length) throw new Error('No frames');
  const pad = Math.max(0, opts.padding | 0);
  const cw = Math.max(...frames.map(f => f.width)), ch = Math.max(...frames.map(f => f.height));
  const cols = Math.max(1, Math.min(frames.length, opts.columns || Math.ceil(Math.sqrt(frames.length))));
  const rows = Math.ceil(frames.length / cols);
  const W = cols * cw + (cols - 1) * pad, H = rows * ch + (rows - 1) * pad;
  const image = blank(W, H);
  const out = {};
  frames.forEach((f, i) => {
    const x = (i % cols) * (cw + pad), y = Math.floor(i / cols) * (ch + pad);
    blit(image, f, x, y);
    out[f.name || `frame-${String(i).padStart(3, '0')}`] = {
      frame: { x, y, w: f.width, h: f.height },
      sourceSize: { w: f.width, h: f.height },
      ...(f.delay != null ? { duration: Math.round(f.delay) } : {}),
    };
  });
  // the "hash" flavour of the TexturePacker / Aseprite JSON format, which most engines read
  const atlas = { frames: out, meta: { app: 'image-to-pixel', image: (opts.name || 'sheet') + '.png', size: { w: W, h: H }, scale: '1', columns: cols, rows, padding: pad } };
  return { image, atlas };
}

/**
 * Cut an image into tiles, drop duplicates (optionally counting mirrored tiles as duplicates)
 * and return the tileset image and a tile map.
 * @param {{ width, height, data }} img
 * @param {{ tileWidth?: number, tileHeight?: number, columns?: number, flips?: boolean }} [opts]
 * @returns {{ image, map: { width: number, height: number, tiles: number[], flips?: number[] }, count: number }}
 */
export function buildTileset(img, opts = {}) {
  const tw = Math.max(1, opts.tileWidth || 8), th = Math.max(1, opts.tileHeight || tw);
  const mw = Math.ceil(img.width / tw), mh = Math.ceil(img.height / th);
  const tiles = [], keys = new Map(), map = [], flipsOut = [];
  const read = (tx, ty) => {
    const t = blank(tw, th);
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const sx = tx * tw + x, sy = ty * th + y;
      if (sx >= img.width || sy >= img.height) continue;
      const so = (sy * img.width + sx) * 4;
      t.data.set([img.data[so], img.data[so + 1], img.data[so + 2], img.data[so + 3]], (y * tw + x) * 4);
    }
    return t;
  };
  const key = t => {
    let s = '';
    for (let i = 0; i < t.data.length; i += 4) s += t.data[i + 3] === 0 ? '.' : String.fromCharCode(t.data[i] + 1, t.data[i + 1] + 1, t.data[i + 2] + 1);
    return s;
  };
  const flip = (t, fx, fy) => {
    const o = blank(tw, th);
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const si = ((fy ? th - 1 - y : y) * tw + (fx ? tw - 1 - x : x)) * 4;
      o.data.set(t.data.subarray(si, si + 4), (y * tw + x) * 4);
    }
    return o;
  };
  for (let ty = 0; ty < mh; ty++) {
    for (let tx = 0; tx < mw; tx++) {
      const t = read(tx, ty);
      let id = keys.get(key(t)), f = 0;
      if (id === undefined && opts.flips) {
        for (const [fx, fy, code] of [[1, 0, 1], [0, 1, 2], [1, 1, 3]]) {
          const k = keys.get(key(flip(t, fx, fy)));
          if (k !== undefined) { id = k; f = code; break; }
        }
      }
      if (id === undefined) { id = tiles.length; tiles.push(t); keys.set(key(t), id); }
      map.push(id); flipsOut.push(f);
    }
  }
  const sheet = packSpriteSheet(tiles, { columns: opts.columns || Math.min(16, tiles.length) });
  return {
    image: sheet.image,
    map: { width: mw, height: mh, tileWidth: tw, tileHeight: th, tiles: map, ...(opts.flips ? { flips: flipsOut } : {}) },
    count: tiles.length,
  };
}

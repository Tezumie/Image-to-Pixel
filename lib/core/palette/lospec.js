// Lospec palette lookup by slug, e.g. 'rgbg-36' from https://lospec.com/palette-list/rgbg-36

import { parseJSON } from './parse.js';

/** Turn a slug or a full Lospec URL into a slug. */
export function lospecSlug(input) {
  const s = String(input || '').trim();
  const m = /palette-list\/([a-z0-9-]+)/i.exec(s);
  return (m ? m[1] : s).toLowerCase().replace(/\.(json|hex|gpl)$/, '');
}

/**
 * Fetch a palette from Lospec. Needs network access; the editor caches results.
 * @returns {Promise<{ name: string, colors: string[], author?: string, slug: string }>}
 */
export async function fetchLospec(slugOrUrl, { fetch: f = globalThis.fetch } = {}) {
  const slug = lospecSlug(slugOrUrl);
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error('That does not look like a Lospec palette slug');
  const res = await f(`https://lospec.com/palette-list/${slug}.json`);
  if (!res.ok) throw new Error(`Lospec returned ${res.status} for "${slug}"`);
  const json = await res.json();
  const p = parseJSON(json);
  return { name: json.name || slug, author: json.author || '', colors: p.colors, slug };
}

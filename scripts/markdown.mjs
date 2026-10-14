// Markdown → HTML for the docs: highlighted code, callouts, heading anchors, a table of contents.
import { Marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import js from 'highlight.js/lib/languages/javascript';
import ts from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import glsl from 'highlight.js/lib/languages/glsl';
import powershell from 'highlight.js/lib/languages/powershell';

hljs.registerLanguage('javascript', js); hljs.registerLanguage('typescript', ts); hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css); hljs.registerLanguage('bash', bash); hljs.registerLanguage('json', json);
hljs.registerLanguage('glsl', glsl); hljs.registerLanguage('powershell', powershell);
hljs.registerAliases(['js', 'mjs'], { languageName: 'javascript' });
hljs.registerAliases(['ts'], { languageName: 'typescript' });
hljs.registerAliases(['html'], { languageName: 'xml' });
hljs.registerAliases(['sh', 'shell'], { languageName: 'bash' });
hljs.registerAliases(['ps1', 'pwsh'], { languageName: 'powershell' });

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const slugify = s => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
const stripTags = s => s.replace(/<[^>]+>/g, '');

const LABEL = { note: 'Note', tip: 'Tip', warning: 'Warning' };
const LANG = { javascript: 'JavaScript', js: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript', html: 'HTML', glsl: 'GLSL', bash: 'Terminal', sh: 'Terminal', powershell: 'PowerShell', json: 'JSON', css: 'CSS' };

/** Split `---\nkey: value\n---` front matter from the body. */
export function frontMatter(src) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return { data: {}, body: src };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = /^\d+$/.test(kv[2]) ? Number(kv[2]) : kv[2].replace(/^["']|["']$/g, '');
  }
  return { data, body: src.slice(m[0].length) };
}

export function renderMarkdown(body) {
  const toc = [];
  let h1 = null;
  const m = new Marked({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        if (depth === 1) { h1 ??= stripTags(text); return ''; }
        const id = slugify(text);
        if (depth === 2 || depth === 3) toc.push({ depth, id, text: stripTags(text) });
        return `<h${depth} id="${id}">${text}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${depth}>\n`;
      },
      code({ text, lang }) {
        const l = (lang || '').trim().split(/\s+/)[0];
        const html = l && hljs.getLanguage(l) ? hljs.highlight(text, { language: l }).value : esc(text);
        const label = LANG[l] || '';
        return `<figure class="code">${label ? `<figcaption>${label}</figcaption>` : ''}<pre><code class="hljs">${html}</code></pre><button class="copy" type="button" aria-label="Copy code">Copy</button></figure>\n`;
      },
    },
  });
  const withCallouts = body.replace(/^> \[!(NOTE|TIP|WARNING)\][ \t]*\n((?:>.*(?:\n|$))*)/gim, (_, type, rest) => {
    const t = type.toLowerCase();
    const inner = rest.split('\n').map(l => l.replace(/^> ?/, '')).join('\n').trim();
    return `<div class="callout callout-${t}">\n<p class="callout-title">${LABEL[t]}</p>\n\n${inner}\n\n</div>\n\n`;
  });
  let html = m.parse(withCallouts);
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
  return { html, toc, h1 };
}

---
title: Embedding the editor
group: Library
order: 4
description: Put the whole editor inside your own page.
---

# Embedding the editor

```html
<link rel="stylesheet" href="node_modules/image-to-pixel/dist/editor.css">
<div id="editor" style="height: 100vh"></div>
<script type="module">
  import { mountEditor } from 'image-to-pixel/editor';
  const editor = await mountEditor(document.getElementById('editor'), { persist: false });
</script>
```

The editor fills its container, so give the container a height. Its styles are scoped to `.itp` classes; the design tokens are CSS custom properties on `:root`, so you can override colours there.

## Options

| Option | Default | |
| --- | --- | --- |
| `settings` | saved or default | Initial settings (partial is fine) |
| `persist` | `true` | Remember settings, theme and palettes in `localStorage` |
| `samples` | `true` | Show the sample images in the empty state |
| `homeHref` | | Makes the logo a link |

## The returned object

| Member | |
| --- | --- |
| `addFiles(files)` | Add `File` objects (images, videos, palettes, settings JSON) |
| `addImage(source, name)` | Add any image-like source |
| `openSample(id)` | `'dusk'`, `'still-life'` or `'potion'` |
| `applyPreset(id)` | Apply a preset by id |
| `setTheme('dark' \| 'light')` | |
| `store` | `store.settings`, `store.update(patch)`, `store.subscribe(fn)`, `store.undo()`, `store.redo()` |
| `result` | The current result |
| `idle()` | Resolves when pending renders are done |

A complete page is in the [embed example](../../examples/embed-editor/).

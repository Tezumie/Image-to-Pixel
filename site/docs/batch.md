---
title: Batches
group: Editor
order: 6
description: Many files, shared settings or one look per file, one ZIP.
---

# Batches

Every file you open goes into the **Files** tab. By default they all share one set of settings: tune the look on one, check the others, then export them all at once.

- Click a file to show it, or press <kbd>Alt</kbd> <kbd>↓</kbd> / <kbd>Alt</kbd> <kbd>↑</kbd>.
- Reorder with **Move up / Move down** in a file's ⋯ menu, or <kbd>Alt</kbd> <kbd>Shift</kbd> <kbd>↑</kbd> / <kbd>↓</kbd>. The order is used for animations and sprite sheets.
- Remove one with its **×** button (or <kbd>Delete</kbd> when it has focus). **Clear** removes them all.
- **Export → All files as ZIP** processes every file and downloads a ZIP of PNGs named after the originals, plus the `settings.json` that made them.

## A file with its own settings

Any file can have its own settings instead of the shared ones. With two or more files open, the inspector shows **Settings apply to: All files / This file** above the tabs.

- **This file** gives the current file a copy of its current settings. From then on, edits change only that file. Its row in the Files tab shows an **Own** badge.
- **All files** links it back to the shared settings and drops its own (a toast lets you undo).
- Each file with its own settings keeps its own undo history, so undo never reaches across files.

The ⋯ button on a file row, or a right-click, has the rest:

| Action | Does |
| --- | --- |
| Give it its own settings / Use shared settings | The same switch as in the inspector |
| Copy settings | Remembers this file's settings |
| Paste settings | Gives this file its own settings, set to the copied ones |
| Apply these settings to all files | Makes these the shared settings and links every file to them |
| Duplicate | Adds a second copy of the file, with its own settings: handy for comparing two looks side by side |

Exports follow each file's own settings. The ZIP also includes a `<name>.settings.json` for every file that has its own.

The ZIP uses the scale, grid and indexed-PNG options from the Export tab.

Several images can also become one animation (GIF, video or sprite sheet): set **Frames from** to **All files, in order** in the Animation section. Each frame uses its file's own look, at the size of the first frame.

> [!NOTE]
> Files stay in memory, not on a server. Very large batches are limited by your browser's memory; a few hundred typical photos are fine.

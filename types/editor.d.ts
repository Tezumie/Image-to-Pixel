// image-to-pixel/editor
import type { Settings, SettingsInput, PixelResult, Source } from './index';

export interface EditorOptions {
  settings?: SettingsInput;
  /** Remember settings, theme and palettes in localStorage (default true). */
  persist?: boolean;
  /** Show sample images in the empty state (default true). */
  samples?: boolean;
  /** Turn the logo into a link. */
  homeHref?: string;
}
export interface EditorStore {
  readonly settings: Settings;
  update(patch: SettingsInput, opts?: { key?: string; history?: boolean }): void;
  replace(settings: SettingsInput): void;
  subscribe(fn: (settings: Settings, why: string) => void): () => void;
  undo(): boolean;
  redo(): boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}
export interface Editor {
  store: EditorStore;
  addFiles(files: File[]): Promise<void>;
  addImage(source: Source, name?: string): Promise<unknown>;
  openSample(id: 'dusk' | 'still-life' | 'potion'): Promise<void>;
  applyPreset(id: string): void;
  setTheme(theme: 'dark' | 'light'): void;
  readonly result: PixelResult | null;
  idle(): Promise<void>;
}
export function mountEditor(root: HTMLElement, options?: EditorOptions): Promise<Editor>;
export const SAMPLES: { id: string; name: string; svg: string }[];

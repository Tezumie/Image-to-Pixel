// Type definitions for image-to-pixel 3.x

export type DitherMethod =
  | 'none' | 'bayer2' | 'bayer4' | 'bayer8' | 'bayer16' | 'cluster4' | 'cluster8' | 'lines' | 'bluenoise' | 'custom'
  | 'floyd-steinberg' | 'atkinson' | 'sierra-lite' | 'sierra' | 'burkes' | 'jarvis' | 'stucki';

export interface SizeSettings {
  mode: 'width' | 'block';
  /** Output width, 1–2048. */
  width: number;
  /** Output height; 0 keeps the aspect ratio. */
  height: number;
  /** Source pixels per output pixel when mode is 'block'. */
  block: number;
  resample: 'box' | 'nearest';
}
export interface AdjustSettings { brightness: number; contrast: number; saturation: number; /** degrees, -180..180 */ hue: number; gamma: number }
export type AspectId = 'original' | '1:1' | '4:3' | '3:4' | '3:2' | '2:3' | '16:9' | '9:16';
/** Which part of the source is used: the largest rectangle of `aspect`, divided by `zoom`, placed by x/y (0..1). */
export interface FrameSettings { aspect: AspectId; zoom: number; x: number; y: number }
export interface PaletteSettings {
  source: 'builtin' | 'custom' | 'extract' | 'none';
  /** Built-in palette id, e.g. 'pico-8'. */
  id: string;
  name: string;
  /** '#rrggbb' strings. */
  colors: string[];
  /** Colours to extract when source is 'extract'. */
  count: number;
  distance: 'oklab' | 'rgb';
}
export interface DitherSettings {
  method: DitherMethod;
  /** 0–1 */
  strength: number;
  /** Threshold matrix for 'custom' (up to 16×16). Only the order of values matters. */
  matrix: number[][] | null;
}
export interface Settings {
  version: number;
  size: SizeSettings;
  frame: FrameSettings;
  adjust: AdjustSettings;
  palette: PaletteSettings;
  dither: DitherSettings;
  alpha: { threshold: number };
  cleanup: { orphans: boolean; smooth: boolean };
  outline: { mode: 'none' | 'outer' | 'inner'; color: string; corners: boolean };
  export: { size: 'scale' | 'source'; scale: number; indexed: boolean; grid: boolean; gridColor: string };
}
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends any[] ? T[K] : Partial<T[K]>) : T[K] };
export type SettingsInput = DeepPartial<Settings>;

export interface RGBAImage { width: number; height: number; data: ArrayLike<number> & { length: number } }

export type Source =
  | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap | HTMLVideoElement | VideoFrame
  | ImageData | RGBAImage | Blob | string
  | { canvas: HTMLCanvasElement } | { elt: HTMLCanvasElement };

export interface PNGOptions { scale?: number; grid?: boolean; gridColor?: string; indexed?: boolean; /** resize to exactly this size (with height) */ width?: number; height?: number }

export interface PixelResult {
  width: number;
  height: number;
  /** RGBA, rows top-down. */
  data: Uint8ClampedArray;
  /** Palette used ('#rrggbb'), or null when colours were kept. */
  palette: string[] | null;
  settings: Settings;
  kind: 'none' | 'ordered' | 'diffusion';
  waves: number;
  /** The framed part of the source, as fractions of its width and height. */
  crop: { x: number; y: number; w: number; h: number };
  backend: 'webgl' | 'cpu';
  ms: number;
  usedColors(): string[];
  toImageData(): ImageData;
  toCanvas(scale?: number, opts?: { grid?: boolean; gridColor?: string; canvas?: HTMLCanvasElement }): HTMLCanvasElement;
  toPNG(opts?: PNGOptions): Promise<Uint8Array>;
  toBlob(opts?: PNGOptions): Promise<Blob>;
}

export interface PixelatorOptions {
  backend?: 'auto' | 'webgl' | 'cpu';
  diffusion?: 'auto' | 'gpu' | 'cpu';
  maxSourceSize?: number;
}
export interface Pixelator {
  readonly backend: 'webgl' | 'cpu';
  readonly renderer: string;
  readonly fallbackReason: string;
  /** The ShaderMate instance behind the GPU backend (null on the CPU). */
  readonly shader: unknown;
  process(source: Source, settings?: SettingsInput): Promise<PixelResult>;
  invalidate(): void;
  destroy(): void;
}

export function createPixelator(options?: PixelatorOptions): Promise<Pixelator>;

export interface ClassicOptions {
  image: Source;
  width: number;
  dither?: string;
  /** 0–100 */
  strength?: number;
  palette?: string[] | string | null;
  resolution?: 'original' | 'pixel';
}
export function pixelate(options: ClassicOptions): Promise<HTMLCanvasElement>;
export function pixelate(source: Source, settings?: SettingsInput): Promise<PixelResult>;

export const VERSION: string;
export const SETTINGS_VERSION: number;
export const MAX_SIZE: number;
export const DEFAULTS: Readonly<Settings>;
export const DITHER_METHODS: { id: DitherMethod; label: string; kind: 'none' | 'ordered' | 'diffusion' }[];
export const LEGACY_DITHER: Record<string, DitherMethod>;
export function ditherKind(id: DitherMethod): 'none' | 'ordered' | 'diffusion';
export function defaultSettings(): Settings;
export function normalizeSettings(input?: SettingsInput): Settings;
export function mergeSettings(base: SettingsInput, patch: SettingsInput): Settings;
export const ASPECTS: { id: AspectId; label: string; ratio: number | null }[];
/** The source pixels a frame keeps. */
export function cropRect(srcWidth: number, srcHeight: number, frame?: Partial<FrameSettings>): { x: number; y: number; w: number; h: number };
export function resolveSize(srcWidth: number, srcHeight: number, size: SizeSettings): { width: number; height: number };
export function encodeSettings(settings: SettingsInput): string;
export function decodeSettings(stringOrUrl: string): Settings;
export function compactSettings(settings: SettingsInput): SettingsInput;
export function settingsToJSON(settings: SettingsInput): string;
export function settingsFromJSON(json: string | object): Settings;

export interface Plan { width: number; height: number; crop: { x: number; y: number; w: number; h: number }; quantize: boolean; kind: 'none' | 'ordered' | 'diffusion'; palette: number[][]; waves: number; settings: Settings }
export function makePlan(settings: SettingsInput, source: RGBAImage): Plan;
export function runCPU(plan: Plan, source: RGBAImage): Uint8ClampedArray;
export function makeResult(plan: Plan, data: Uint8ClampedArray, backend?: 'webgl' | 'cpu', ms?: number): PixelResult;

export interface BuiltinPalette { id: string; name: string; author: string; colors: string[] }
export const PALETTES: BuiltinPalette[];
export function getPalette(idOrName: string): BuiltinPalette | null;
export function parsePalette(text: string, filename?: string): { name: string; colors: string[] };
export function toGPL(name: string, colors: string[]): string;
export function toHexFile(colors: string[]): string;
export function toPaletteJSON(name: string, colors: string[]): string;
export function extractPalette(image: RGBAImage, count?: number, opts?: { maxSamples?: number; alphaThreshold?: number }): string[];
export function fetchLospec(slugOrUrl: string, opts?: { fetch?: typeof fetch }): Promise<{ name: string; author: string; colors: string[]; slug: string }>;
export function lospecSlug(input: string): string;

export interface ThresholdMap { w: number; h: number; levels: number; values: Uint8Array }
export function thresholdMap(method: DitherMethod, custom?: number[][] | null): ThresholdMap;
export function parseMatrix(text: string): number[][];
export function bayer(n: number): number[][];
export const KERNELS: Record<string, [number, number, number][]>;

export interface Preset { id: string; name: string; description: string; settings: SettingsInput }
export const PRESETS: Preset[];
export function getPreset(id: string): Preset | null;

export function parseColor(c: string | number[]): [number, number, number];
export function toHex(rgb: number[]): string;
export function oklab(r: number, g: number, b: number): [number, number, number];

export interface Frame { width: number; height: number; canvas: HTMLCanvasElement | null; data: ArrayLike<number> }
export function toFrame(source: Source, opts?: { maxSize?: number; canvas?: HTMLCanvasElement }): Promise<Frame>;
export function loadImage(src: string | Blob): Promise<HTMLImageElement | ImageBitmap>;

export function upscale(image: RGBAImage, k?: number, opts?: { grid?: boolean; gridColor?: string; gridAlpha?: number }): { width: number; height: number; data: Uint8ClampedArray };
export function resizeNearest(image: RGBAImage, width: number, height: number): { width: number; height: number; data: Uint8ClampedArray };
export function uniqueColors(image: RGBAImage, limit?: number): string[];
export function detectGrid(image: RGBAImage, tolerance?: number): number;
export function hasTransparency(image: RGBAImage): boolean;
export function toCanvas(image: RGBAImage, scale?: number, opts?: { grid?: boolean; gridColor?: string; canvas?: HTMLCanvasElement }): HTMLCanvasElement;
export function downloadBlob(data: Blob | Uint8Array | string, filename: string, type?: string): void;
export function encodePNG(image: RGBAImage, opts?: PNGOptions): Promise<Uint8Array>;
export function encodeGIF(frames: (RGBAImage & { delay?: number })[], opts?: { loop?: number; scale?: number; delay?: number }): Uint8Array;
export function createZip(entries: { name: string; data: Uint8Array | string; date?: Date }[]): Uint8Array;
export function packSpriteSheet(frames: (RGBAImage & { name?: string; delay?: number })[], opts?: { columns?: number; padding?: number; name?: string }): { image: { width: number; height: number; data: Uint8ClampedArray }; atlas: any };
export function buildTileset(image: RGBAImage, opts?: { tileWidth?: number; tileHeight?: number; columns?: number; flips?: boolean }): {
  image: { width: number; height: number; data: Uint8ClampedArray };
  map: { width: number; height: number; tileWidth: number; tileHeight: number; tiles: number[]; flips?: number[] };
  count: number;
};

export function videoReady(video: HTMLVideoElement, opts?: { timeout?: number }): Promise<HTMLVideoElement>;
/** A readable Error for a <video>'s MediaError; `code` is the MediaError code. */
export function mediaError(video: HTMLVideoElement): Error & { code: number; detail?: string };
/** Best-effort codec name read from an MP4/MOV/WebM file's bytes ('' when unknown). */
export function sniffVideoCodec(file: Blob): Promise<string>;
export function seekTo(video: HTMLVideoElement, time: number): Promise<void>;
export function estimateFps(video: HTMLVideoElement, fallback?: number): Promise<number>;
export function frameTimes(opts: { duration: number; fps: number; start?: number; end?: number; maxFrames?: number }): number[];
export function forEachFrame(video: HTMLVideoElement, opts: {
  fps: number; start?: number; end?: number; maxFrames?: number; signal?: AbortSignal;
  /** Explicit frame timestamps (seconds), in selection order. */
  times?: number[];
  onFrame: (info: { index: number; time: number; total: number }) => unknown;
}): Promise<number>;

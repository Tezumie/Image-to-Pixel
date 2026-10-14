// image-to-pixel/video
import type { RGBAImage } from './index';
export { forEachFrame, estimateFps, seekTo, frameTimes, videoReady } from './index';

export interface VideoEncoderOptions {
  format: 'mp4' | 'webm';
  fps: number;
  /** Size of the frames you will add. */
  width: number;
  height: number;
  /** Whole-number upscale applied to every frame. */
  scale?: number;
  bitrate?: number;
}
export interface PixelVideoEncoder {
  readonly width: number;
  readonly height: number;
  readonly codec: string;
  add(frame: RGBAImage): Promise<void>;
  finish(): Promise<Blob>;
}
export function createVideoEncoder(opts: VideoEncoderOptions): Promise<PixelVideoEncoder>;
export function encodeVideo(frames: RGBAImage[], opts: Omit<VideoEncoderOptions, 'width' | 'height'>): Promise<Blob>;
export function videoSupport(width?: number, height?: number): Promise<{ mp4: boolean; webm: boolean; webcodecs: boolean }>;

/** Minimal MP4 muxer (one H.264 track, fast start). Feed it VideoEncoder output, or AVCC samples. */
export interface Mp4Muxer {
  addChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void;
  /** timestamp/duration in microseconds; data is length-prefixed NAL units. */
  addSample(data: Uint8Array, info: { key: boolean; timestamp: number; duration?: number }): void;
  /** AVCDecoderConfigurationRecord ('avcC'). */
  setDescription(avcC: Uint8Array): void;
  finish(): Uint8Array;
}
export function createMp4Muxer(opts: { width: number; height: number; timescale?: number }): Mp4Muxer;
/** Minimal WebM muxer (one VP8/VP9/AV1 track, with SeekHead and Cues). */
export interface WebmMuxer {
  addChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void;
  /** timestamp in microseconds */
  addFrame(data: Uint8Array, info: { key: boolean; timestamp: number }): void;
  finish(): Uint8Array;
}
export function createWebmMuxer(opts: { width: number; height: number; codec?: 'vp8' | 'vp9' | 'av1'; fps?: number }): WebmMuxer;

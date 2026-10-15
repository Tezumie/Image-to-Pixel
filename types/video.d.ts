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
  /**
   * Soundtrack to include, e.g. from decodeAudio(file, { start, end }). Cut to the video's length.
   * MP4 gets AAC (or Opus where AAC can't be encoded), WebM gets Opus. If the browser can't encode
   * either, the video is made without it: check `audioCodec` on the encoder.
   */
  audio?: PCMAudio | null;
  /** Bits per second for the audio. Default 128000. */
  audioBitrate?: number;
}
/** Planar 32-bit float PCM, one array per channel. */
export interface PCMAudio {
  sampleRate: number;
  numberOfChannels: number;
  channels: Float32Array[];
  /** Seconds (informational). */
  duration?: number;
}
export type AudioCodec = 'aac' | 'opus';
export interface PixelVideoEncoder {
  readonly width: number;
  readonly height: number;
  readonly codec: string;
  /** The audio codec used, or null when there is no soundtrack (none given, or none this browser can encode). */
  readonly audioCodec: AudioCodec | null;
  add(frame: RGBAImage): Promise<void>;
  finish(): Promise<Blob>;
}
export function createVideoEncoder(opts: VideoEncoderOptions): Promise<PixelVideoEncoder>;
export function encodeVideo(frames: RGBAImage[], opts: Omit<VideoEncoderOptions, 'width' | 'height'>): Promise<Blob>;
export function videoSupport(width?: number, height?: number): Promise<{ mp4: boolean; webm: boolean; webcodecs: boolean; aac: boolean; opus: boolean }>;

/**
 * Decode a file's audio track to PCM (resampled, default 48 kHz; mixed down to at most 2 channels; trimmed to
 * start/end in seconds). Resolves with null when there is no audio track, it can't be decoded, or there is no
 * Web Audio (Node).
 */
export function decodeAudio(
  source: Blob | ArrayBuffer | ArrayBufferView | string | HTMLMediaElement,
  opts?: { start?: number; end?: number; sampleRate?: number; channels?: 1 | 2 },
): Promise<PCMAudio | null>;
/** Encode PCM with WebCodecs' AudioEncoder; chunks go to onChunk (e.g. a muxer's addAudioChunk). */
export function encodeAudio(
  pcm: PCMAudio,
  opts: { codec?: AudioCodec; config?: AudioEncoderConfig; bitrate?: number; maxDuration?: number; onChunk: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void },
): Promise<void>;
export function audioCodecSupported(codec: AudioCodec, sampleRate?: number, numberOfChannels?: number): Promise<boolean>;
/** An AudioEncoder configuration this browser accepts for `codec` (common rates and bitrates are tried), or null. */
export function findAudioConfig(codec: AudioCodec, sampleRate?: number, numberOfChannels?: number, bitrate?: number): Promise<AudioEncoderConfig | null>;

/** The audio track a muxer should add. */
export interface MuxerAudioTrack {
  codec: AudioCodec;
  sampleRate: number;
  numberOfChannels: number;
  /** MP4 only: bitrate written into the AAC decoder config. */
  bitrate?: number;
}

/** Minimal MP4 muxer (one H.264 track and an optional AAC or Opus track, fast start). Feed it encoder output, or raw samples. */
export interface Mp4Muxer {
  addChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void;
  /** timestamp/duration in microseconds; data is length-prefixed NAL units. */
  addSample(data: Uint8Array, info: { key: boolean; timestamp: number; duration?: number }): void;
  /** AVCDecoderConfigurationRecord ('avcC'). */
  setDescription(avcC: Uint8Array): void;
  /** AudioEncoder output (needs the `audio` option). */
  addAudioChunk(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): void;
  /** One encoded audio frame, in order. timestamp/duration in microseconds. */
  addAudioSample(data: Uint8Array, info: { timestamp: number; duration?: number }): void;
  /** AAC AudioSpecificConfig (for Opus, an optional OpusHead to read the pre-skip from). */
  setAudioDescription(config: Uint8Array): void;
  finish(): Uint8Array;
}
export function createMp4Muxer(opts: { width: number; height: number; timescale?: number; audio?: MuxerAudioTrack | null }): Mp4Muxer;
/** Minimal WebM muxer (one VP8/VP9/AV1 track and an optional Opus track, with SeekHead and Cues). */
export interface WebmMuxer {
  addChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void;
  /** timestamp in microseconds */
  addFrame(data: Uint8Array, info: { key: boolean; timestamp: number }): void;
  /** AudioEncoder output (needs the `audio` option). */
  addAudioChunk(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): void;
  /** One Opus packet, in order. timestamp/duration in microseconds. */
  addAudioFrame(data: Uint8Array, info: { timestamp: number; duration?: number }): void;
  finish(): Uint8Array;
}
export function createWebmMuxer(opts: { width: number; height: number; codec?: 'vp8' | 'vp9' | 'av1'; fps?: number; audio?: (MuxerAudioTrack & { codec: 'opus' }) | null }): WebmMuxer;

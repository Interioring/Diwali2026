import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { DURATION, GreetingRenderer, type SceneData } from "../greeting/renderer.ts";
import { loadGreetingFonts } from "../lib/fonts.ts";
import { MUSIC_SAMPLE_RATE, renderMusic } from "../audio/music.ts";

/**
 * Vertical 9:16 MP4 for WhatsApp Status and Instagram Stories.
 *
 * Primary path: WebCodecs H.264 + an MP4 muxer, rendering each frame from the
 * same `draw(t)` the screen uses, so the file matches the greeting exactly and
 * encodes faster than real time. Fallback: MediaRecorder, only when it can
 * record real MP4. Never hands back WebM labelled as MP4.
 */

const FPS = 30;
// Sized for WhatsApp Status and Instagram Stories, which re-compress uploads
// to roughly 1–4 Mbps anyway: ~4.4 MB for the 14 s film at 1080p (it was 9.3 MB
// at 5.5 Mbps with no visible gain once shared). Fewer keyframes spend the same
// budget on picture instead.
const BITRATE_1080 = 2_500_000;
const BITRATE_720 = 1_500_000;
const KEYFRAME_EVERY_S = 5;

export type ExportMethod = "webcodecs" | "mediarecorder";

interface EncoderChoice {
  config: VideoEncoderConfig;
  width: number;
  height: number;
}

async function pickEncoder(): Promise<EncoderChoice | null> {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return null;
  const sizes: Array<[number, number, string]> = [
    [1080, 1920, "28"], // level 4.0
    [720, 1280, "1f"], // level 3.1
  ];
  const profiles = ["64", "4d", "42"]; // high, main, baseline
  for (const [width, height, level] of sizes) {
    for (const profile of profiles) {
      const config: VideoEncoderConfig = {
        codec: `avc1.${profile}00${level}`,
        width,
        height,
        bitrate: width >= 1080 ? BITRATE_1080 : BITRATE_720,
        framerate: FPS,
        avc: { format: "avc" },
      };
      try {
        const support = await VideoEncoder.isConfigSupported(config);
        if (support.supported) return { config: support.config ?? config, width, height };
      } catch {
        // try the next configuration
      }
    }
  }
  return null;
}

function recorderMp4Type(): string | null {
  if (typeof MediaRecorder === "undefined" || typeof HTMLCanvasElement === "undefined") return null;
  if (!("captureStream" in HTMLCanvasElement.prototype)) return null;
  for (const type of ["video/mp4;codecs=avc1.42E01F", "video/mp4;codecs=avc1", "video/mp4"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

/** AAC in MP4 plays everywhere WhatsApp and Instagram run. Without it, the video ships silent. */
async function pickAudioEncoder(): Promise<AudioEncoderConfig | null> {
  if (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") return null;
  const config: AudioEncoderConfig = { codec: "mp4a.40.2", sampleRate: MUSIC_SAMPLE_RATE, numberOfChannels: 2, bitrate: 128_000 };
  try {
    const support = await AudioEncoder.isConfigSupported(config);
    return support.supported ? (support.config ?? config) : null;
  } catch {
    return null;
  }
}

export async function detectExport(): Promise<ExportMethod | null> {
  if (await pickEncoder()) return "webcodecs";
  if (recorderMp4Type()) return "mediarecorder";
  return null;
}

export class ExportCancelled extends Error {}

export interface ExportResult {
  blob: Blob;
  /** False when this device can't encode AAC: the video is then silent. */
  withMusic: boolean;
}

export async function exportGreetingVideo(
  data: SceneData,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<ExportResult> {
  await loadGreetingFonts(data.recipientName);
  const choice = await pickEncoder();
  if (choice) return encodeWithWebCodecs(data, choice, onProgress, signal);
  const type = recorderMp4Type();
  if (type) return { blob: await recordWithMediaRecorder(data, type, onProgress, signal), withMusic: false };
  throw new Error("This browser can't make MP4 video.");
}

async function encodeWithWebCodecs(
  data: SceneData,
  { config, width, height }: EncoderChoice,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<ExportResult> {
  const canvas = document.createElement("canvas");
  const renderer = new GreetingRenderer(canvas, "play");
  renderer.showInvite = true; // the video carries no link, so it ends on the address
  renderer.resize(width, height);
  renderer.setData(data);

  const audioConfig = await pickAudioEncoder();
  const music = audioConfig ? await renderMusic().catch(() => null) : null;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width, height, frameRate: FPS },
    ...(audioConfig && music ? { audio: { codec: "aac" as const, numberOfChannels: 2, sampleRate: MUSIC_SAMPLE_RATE } } : {}),
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });
  let failure: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      failure = e;
    },
  });
  encoder.configure(config);

  const total = Math.round(DURATION * FPS);
  const frameUs = 1_000_000 / FPS;
  try {
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw new ExportCancelled();
      if (failure) throw failure;
      renderer.draw(i / FPS);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
      encoder.encode(frame, { keyFrame: i % (FPS * KEYFRAME_EVERY_S) === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4));
      if (i % 4 === 0) {
        onProgress((i + 1) / total);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await encoder.flush();
    if (failure) throw failure;
    if (audioConfig && music) await encodeAudio(music, audioConfig, muxer);
    muxer.finalize();
    onProgress(1);
    return { blob: new Blob([target.buffer], { type: "video/mp4" }), withMusic: Boolean(audioConfig && music) };
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
}

async function encodeAudio(music: AudioBuffer, config: AudioEncoderConfig, muxer: Muxer<ArrayBufferTarget>) {
  let failed = false;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: () => {
      failed = true;
    },
  });
  encoder.configure(config);
  const frames = music.length;
  const block = 4800;
  const left = music.getChannelData(0);
  const right = music.getChannelData(1);
  for (let start = 0; start < frames && !failed; start += block) {
    const n = Math.min(block, frames - start);
    const planar = new Float32Array(n * 2);
    planar.set(left.subarray(start, start + n), 0);
    planar.set(right.subarray(start, start + n), n);
    const data = new AudioData({
      format: "f32-planar",
      sampleRate: MUSIC_SAMPLE_RATE,
      numberOfFrames: n,
      numberOfChannels: 2,
      timestamp: Math.round((start / MUSIC_SAMPLE_RATE) * 1_000_000),
      data: planar,
    });
    encoder.encode(data);
    data.close();
  }
  await encoder.flush();
  encoder.close();
}

async function recordWithMediaRecorder(
  data: SceneData,
  mimeType: string,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const renderer = new GreetingRenderer(canvas, "play");
  renderer.showInvite = true;
  renderer.resize(720, 1280);
  renderer.setData(data);
  renderer.draw(0);
  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: BITRATE_720 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const done = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  recorder.start(250);
  const start = performance.now();
  await new Promise<void>((resolve, reject) => {
    const tick = () => {
      if (signal?.aborted) {
        recorder.stop();
        reject(new ExportCancelled());
        return;
      }
      const t = (performance.now() - start) / 1000;
      renderer.draw(Math.min(t, DURATION));
      onProgress(Math.min(1, t / DURATION));
      if (t >= DURATION + 0.2) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  await done;
  stream.getTracks().forEach((tr) => tr.stop());
  const type = recorder.mimeType || mimeType;
  if (!type.startsWith("video/mp4")) throw new Error("Recorder did not produce MP4.");
  return new Blob(chunks, { type: "video/mp4" });
}

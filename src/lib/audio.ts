/** Whisper is trained on 16 kHz mono audio; anything else must be resampled. */
export const TARGET_SAMPLE_RATE = 16_000;

/** Guard rail: one hour of 16 kHz float PCM is ~230 MB in memory. */
export const MAX_DURATION_SECONDS = 60 * 60;

type DecodedAudio = {
  /** 16 kHz mono PCM. */
  pcm: Float32Array;
  durationSeconds: number;
};

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
  webkitOfflineAudioContext?: typeof OfflineAudioContext;
};

function getAudioContextCtor(): typeof AudioContext {
  const w = window as WebkitWindow;
  const Ctor = window.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error("This browser has no Web Audio support.");
  return Ctor;
}

function getOfflineAudioContextCtor(): typeof OfflineAudioContext {
  const w = window as WebkitWindow;
  const Ctor = window.OfflineAudioContext ?? w.webkitOfflineAudioContext;
  if (!Ctor) throw new Error("This browser has no OfflineAudioContext support.");
  return Ctor;
}

/**
 * Decode any browser-supported audio or video container down to the exact
 * shape Whisper expects.
 *
 * Two passes on purpose: decode at the file's native rate first (asking an
 * AudioContext to decode straight to 16 kHz is unreliable across browsers),
 * then let OfflineAudioContext do the downmix and resample with its own
 * high-quality interpolation.
 */
export async function decodeToMono16k(source: Blob): Promise<DecodedAudio> {
  const bytes = await source.arrayBuffer();
  if (bytes.byteLength === 0) {
    throw new Error("That file is empty.");
  }

  const AudioCtor = getAudioContextCtor();
  const decodeContext = new AudioCtor();

  let decoded: AudioBuffer;
  try {
    decoded = await decodeContext.decodeAudioData(bytes);
  } catch {
    throw new Error(
      "Could not decode that file. Try WAV, MP3, M4A, FLAC, OGG, WebM, or MP4."
    );
  } finally {
    void decodeContext.close();
  }

  if (decoded.duration > MAX_DURATION_SECONDS) {
    throw new Error(
      `Audio is ${Math.round(decoded.duration / 60)} minutes. Please keep it under 60.`
    );
  }

  const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
  const OfflineCtor = getOfflineAudioContextCtor();
  const offline = new OfflineCtor(1, frames, TARGET_SAMPLE_RATE);

  const node = offline.createBufferSource();
  node.buffer = decoded;
  node.connect(offline.destination);
  node.start();

  const rendered = await offline.startRendering();

  // Copy out of the AudioBuffer so the backing memory can be transferred to
  // the worker without keeping the whole buffer alive.
  const pcm = new Float32Array(rendered.length);
  pcm.set(rendered.getChannelData(0));

  return { pcm, durationSeconds: decoded.duration };
}

/** Picks a container the current browser can actually record. */
export function pickRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

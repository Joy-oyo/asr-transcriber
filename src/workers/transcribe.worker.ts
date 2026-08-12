/// <reference lib="webworker" />

/**
 * Inference worker.
 *
 * Everything expensive — weight download, ONNX session creation, decoding —
 * happens here so the UI thread never blocks. The worker owns exactly one
 * pipeline at a time and rebuilds it only when the model or backend changes.
 */

import { pipeline, env } from "@huggingface/transformers";
import { WEIGHT_DTYPE, getModel } from "@/lib/models";
import type { Device, Segment, WorkerRequest, WorkerResponse } from "@/lib/types";

// Weights come from the Hugging Face CDN; there is no local model directory.
env.allowLocalModels = false;

const SAMPLE_RATE = 16_000;

/**
 * Whisper's own sliding window (`chunk_length_s`) handles overlap and
 * de-duplication far better than hand-rolled stitching, so we only split the
 * audio into coarse blocks. Blocks exist purely to report progress and stream
 * partial results — 5 minutes is long enough that boundary artefacts are rare.
 */
const BLOCK_SECONDS = 300;

type AsrChunk = { timestamp: [number, number | null]; text: string };
type AsrOutput = { text: string; chunks?: AsrChunk[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<any>;

type ProgressInfo = {
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
  progress?: number;
};

let transcriber: Transcriber | null = null;
let loadedKey = "";
let loading: Promise<Transcriber> | null = null;

function post(message: WorkerResponse, transfer?: Transferable[]) {
  self.postMessage(message, { transfer: transfer ?? [] });
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unexpected inference error.";
}

/** Falls back to WASM whenever WebGPU is missing or refuses an adapter. */
async function resolveDevice(requested: Device): Promise<Device> {
  if (requested !== "webgpu") return "wasm";
  const gpu = navigator.gpu;
  if (!gpu) return "wasm";
  try {
    const adapter = await gpu.requestAdapter();
    return adapter ? "webgpu" : "wasm";
  } catch {
    return "wasm";
  }
}

async function getTranscriber(modelId: string, requested: Device): Promise<Transcriber> {
  const device = await resolveDevice(requested);
  const key = `${modelId}::${device}`;

  post({ type: "device", device });

  if (transcriber && loadedKey === key) {
    post({ type: "ready", modelId });
    return transcriber;
  }
  if (loading && loadedKey === key) return loading;

  loadedKey = key;

  loading = (async () => {
    const instance = (await pipeline("automatic-speech-recognition", modelId, {
      device,
      dtype: WEIGHT_DTYPE,
      progress_callback: (info: ProgressInfo) => {
        if (info.status !== "progress" || !info.file) return;
        post({
          type: "download",
          progress: {
            file: info.file,
            loaded: info.loaded ?? 0,
            total: info.total ?? 0,
            percent: Math.min(100, Math.max(0, Math.round(info.progress ?? 0))),
          },
        });
      },
    })) as unknown as Transcriber;

    transcriber = instance;
    post({ type: "ready", modelId });
    return instance;
  })();

  try {
    return await loading;
  } catch (error) {
    // Reset so a retry is not short-circuited by a poisoned cache entry.
    transcriber = null;
    loadedKey = "";
    throw error;
  } finally {
    loading = null;
  }
}

/**
 * Whisper reports timestamps relative to the block it saw, and leaves the
 * final `end` open. Shift everything back onto the original timeline and close
 * any open span against the next segment.
 */
function normalizeChunks(
  chunks: AsrChunk[],
  offsetSeconds: number,
  blockEndSeconds: number
): Segment[] {
  const segments: Segment[] = [];

  chunks.forEach((chunk, index) => {
    const text = chunk.text?.trim();
    if (!text) return;

    const rawStart = chunk.timestamp?.[0] ?? 0;
    const rawEnd = chunk.timestamp?.[1];
    const nextStart = chunks[index + 1]?.timestamp?.[0];

    const start = offsetSeconds + rawStart;
    const end =
      offsetSeconds + (rawEnd ?? nextStart ?? Math.max(rawStart + 1, blockEndSeconds - offsetSeconds));

    segments.push({ start, end: Math.max(end, start + 0.05), text });
  });

  return segments;
}

async function transcribe(request: Extract<WorkerRequest, { type: "transcribe" }>) {
  const { audio, language, task, modelId, device } = request;

  if (audio.length === 0) throw new Error("That recording has no audio.");

  // Ensuring the pipeline here rather than trusting a prior `load` message
  // removes any ordering race between the two requests.
  const instance = await getTranscriber(modelId, device);
  const model = getModel(modelId);

  const startedAt = performance.now();
  const blockSamples = BLOCK_SECONDS * SAMPLE_RATE;
  const blockCount = Math.max(1, Math.ceil(audio.length / blockSamples));
  const segments: Segment[] = [];

  for (let index = 0; index < blockCount; index += 1) {
    const from = index * blockSamples;
    const to = Math.min(audio.length, from + blockSamples);
    const block = audio.subarray(from, to);

    const output = (await instance(block, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
      // English-only checkpoints throw if these are supplied at all.
      ...(model.multilingual ? { language: language ?? null, task } : {}),
    })) as AsrOutput;

    const blockChunks = output.chunks ?? [
      { timestamp: [0, (to - from) / SAMPLE_RATE] as [number, number], text: output.text ?? "" },
    ];

    segments.push(
      ...normalizeChunks(blockChunks, from / SAMPLE_RATE, to / SAMPLE_RATE)
    );

    post({
      type: "progress",
      percent: Math.round(((index + 1) / blockCount) * 100),
      segments,
    });
  }

  post({ type: "done", segments, elapsedMs: performance.now() - startedAt });
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  void (async () => {
    try {
      if (request.type === "load") {
        await getTranscriber(request.modelId, request.device);
        return;
      }
      if (request.type === "transcribe") {
        await transcribe(request);
      }
    } catch (error) {
      post({ type: "error", message: describeError(error) });
    }
  })();
});

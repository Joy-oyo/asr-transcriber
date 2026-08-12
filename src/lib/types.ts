/**
 * Shared contract between the UI thread and the inference worker.
 * Kept in one file so both sides can never drift apart.
 */

export type Device = "webgpu" | "wasm";

/** One transcribed span of audio. `end` is clamped, never null. */
export type Segment = {
  start: number;
  end: number;
  text: string;
};

export type LoadProgress = {
  /** Weight file currently downloading, e.g. `encoder_model_quantized.onnx`. */
  file: string;
  loaded: number;
  total: number;
  /** 0–100. */
  percent: number;
};

export type WorkerRequest =
  | {
      type: "load";
      modelId: string;
      device: Device;
    }
  | {
      type: "transcribe";
      modelId: string;
      device: Device;
      /** 16 kHz mono PCM. Transferred, not copied. */
      audio: Float32Array;
      /** BCP-47-ish Whisper code such as `en`. Null means auto-detect. */
      language: string | null;
      task: "transcribe" | "translate";
    };

export type WorkerResponse =
  | { type: "device"; device: Device }
  | { type: "download"; progress: LoadProgress }
  | { type: "ready"; modelId: string }
  | { type: "progress"; percent: number; segments: Segment[] }
  | { type: "done"; segments: Segment[]; elapsedMs: number }
  | { type: "error"; message: string };

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeToMono16k } from "@/lib/audio";
import type { Device, LoadProgress, Segment, WorkerRequest, WorkerResponse } from "@/lib/types";

export type Status =
  | "idle"
  | "loading-model"
  | "ready"
  | "decoding"
  | "transcribing"
  | "done"
  | "error";

export type TranscriberState = {
  status: Status;
  /**
   * True from the moment a run is requested until it finishes or fails.
   *
   * `status` cannot answer this on its own: a run that has to fetch weights
   * passes back through `loading-model` and `ready`, leaving a window where
   * nothing looks busy even though the worker is mid-flight.
   */
  running: boolean;
  /** Backend the worker actually secured, which may differ from the request. */
  device: Device | null;
  readyModelId: string | null;
  /**
   * Per-file download state. Whisper pulls the encoder and decoder in
   * parallel, so a single "current file" reading bounces between them — the
   * aggregate across files is the only honest number.
   */
  downloads: Record<string, LoadProgress>;
  percent: number;
  segments: Segment[];
  elapsedMs: number | null;
  audioSeconds: number | null;
  error: string | null;
};

const INITIAL: TranscriberState = {
  status: "idle",
  running: false,
  device: null,
  readyModelId: null,
  downloads: {},
  percent: 0,
  segments: [],
  elapsedMs: null,
  audioSeconds: null,
  error: null,
};

/** Aggregate byte counts across every weight file currently downloading. */
export function downloadTotals(downloads: Record<string, LoadProgress>) {
  const files = Object.values(downloads);
  const total = files.reduce((sum, file) => sum + file.total, 0);
  const loaded = files.reduce((sum, file) => sum + file.loaded, 0);
  return {
    fileCount: files.length,
    loaded,
    total,
    percent: total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0,
  };
}

export function useTranscriber() {
  const [state, setState] = useState<TranscriberState>(INITIAL);
  const workerRef = useRef<Worker | null>(null);

  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;

    const worker = new Worker(new URL("../workers/transcribe.worker.ts", import.meta.url), {
      type: "module",
    });

    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;

      setState((prev) => {
        switch (message.type) {
          case "device":
            return { ...prev, device: message.device };
          case "download":
            return {
              ...prev,
              status: "loading-model",
              downloads: { ...prev.downloads, [message.progress.file]: message.progress },
            };
          case "ready":
            return {
              ...prev,
              // A run that stopped to fetch weights resumes here; saying
              // "ready" would imply it is waiting on the user.
              status: prev.running ? "transcribing" : "ready",
              readyModelId: message.modelId,
              downloads: {},
            };
          case "progress":
            return {
              ...prev,
              status: "transcribing",
              percent: message.percent,
              segments: message.segments,
            };
          case "done":
            return {
              ...prev,
              status: "done",
              running: false,
              percent: 100,
              segments: message.segments,
              elapsedMs: message.elapsedMs,
            };
          case "error":
            return { ...prev, status: "error", running: false, error: message.message };
          default:
            return prev;
        }
      });
    });

    worker.addEventListener("error", () => {
      setState((prev) => ({
        ...prev,
        status: "error",
        running: false,
        error: "The inference worker crashed. Reload the page and try again.",
      }));
    });

    workerRef.current = worker;
    return worker;
  }, []);

  // One worker per mount; tear it down so hot reloads do not leak sessions.
  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    },
    []
  );

  const send = useCallback(
    (request: WorkerRequest, transfer?: Transferable[]) => {
      getWorker().postMessage(request, transfer ?? []);
    },
    [getWorker]
  );

  const loadModel = useCallback(
    (modelId: string, device: Device) => {
      setState((prev) => ({
        ...prev,
        status: "loading-model",
        readyModelId: null,
        error: null,
        downloads: {},
      }));
      send({ type: "load", modelId, device });
    },
    [send]
  );

  const transcribe = useCallback(
    async (
      source: Blob,
      options: {
        modelId: string;
        device: Device;
        language: string | null;
        task: "transcribe" | "translate";
      }
    ) => {
      setState((prev) => ({
        ...prev,
        status: "decoding",
        running: true,
        error: null,
        percent: 0,
        segments: [],
        elapsedMs: null,
      }));

      try {
        const { pcm, durationSeconds } = await decodeToMono16k(source);
        setState((prev) => ({ ...prev, status: "transcribing", audioSeconds: durationSeconds }));

        // Hand over the buffer instead of copying it — a 30-minute clip is
        // ~115 MB of Float32.
        send(
          {
            type: "transcribe",
            modelId: options.modelId,
            device: options.device,
            audio: pcm,
            language: options.language,
            task: options.task,
          },
          [pcm.buffer]
        );
      } catch (error) {
        setState((prev) => ({
          ...prev,
          status: "error",
          running: false,
          error: error instanceof Error ? error.message : "Could not read that audio.",
        }));
      }
    },
    [send]
  );

  const reset = useCallback(() => {
    setState((prev) => ({
      ...INITIAL,
      // Keep what the worker already paid for.
      device: prev.device,
      readyModelId: prev.readyModelId,
      status: prev.readyModelId ? "ready" : "idle",
    }));
  }, []);

  return { state, loadModel, transcribe, reset };
}

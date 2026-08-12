"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pickRecordingMimeType } from "@/lib/audio";

export type RecorderState = {
  isRecording: boolean;
  /** Seconds since recording started. */
  elapsed: number;
  /** Smoothed RMS level, 0–1, for the meter. */
  level: number;
  error: string | null;
};

function isRecordingSupported() {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

/**
 * Microphone capture with a live level meter.
 *
 * The stream, MediaRecorder, AudioContext and RAF loop are all torn down on
 * stop and on unmount — leaving any of them running keeps the browser's
 * recording indicator lit, which users reasonably read as a privacy problem.
 */
export function useRecorder(onComplete: (clip: Blob) => void) {
  const [state, setState] = useState<RecorderState>({
    isRecording: false,
    elapsed: 0,
    level: 0,
    error: null,
  });

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const onCompleteRef = useRef(onComplete);

  // Kept in a ref so `stop` never closes over a stale callback.
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    void contextRef.current?.close();
    contextRef.current = null;

    recorderRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (recorderRef.current) return;

    if (!isRecordingSupported()) {
      setState((prev) => ({
        ...prev,
        error: "This browser cannot record audio. Upload a file instead.",
      }));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const mimeType = pickRecordingMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });

      recorder.addEventListener("stop", () => {
        const clip = new Blob(chunksRef.current, { type: mimeType ?? "audio/webm" });
        chunksRef.current = [];
        cleanup();
        setState((prev) => ({ ...prev, isRecording: false, level: 0 }));
        if (clip.size > 0) onCompleteRef.current(clip);
      });

      // Level meter
      const context = new AudioContext();
      contextRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);

      const buffer = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
        const rms = Math.sqrt(sum / buffer.length);
        setState((prev) => ({
          ...prev,
          // Ease toward the new value so the meter does not strobe.
          level: prev.level * 0.7 + Math.min(1, rms * 4) * 0.3,
        }));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      const startedAt = Date.now();
      timerRef.current = setInterval(() => {
        setState((prev) => ({ ...prev, elapsed: (Date.now() - startedAt) / 1000 }));
      }, 200);

      recorder.start();
      recorderRef.current = recorder;
      setState({ isRecording: true, elapsed: 0, level: 0, error: null });
    } catch (error) {
      cleanup();
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone access was blocked. Enable it in your browser settings."
          : "Could not start recording on this device.";
      setState((prev) => ({ ...prev, isRecording: false, error: message }));
    }
  }, [cleanup]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }, []);

  return { ...state, start, stop };
}

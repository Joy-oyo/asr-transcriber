"use client";

import { useRecorder } from "@/hooks/use-recorder";
import { formatClock } from "@/lib/format";

const BAR_COUNT = 12;

export default function Recorder({
  disabled,
  onClip,
}: {
  disabled?: boolean;
  onClip: (clip: Blob) => void;
}) {
  const { isRecording, elapsed, level, error, start, stop } = useRecorder(onClip);

  return (
    <div className={`nb nb-shadow-sm ${isRecording ? "bg-punch" : "bg-card"} px-4 py-4`}>
      <div className="flex items-center gap-3.5">
        <button
          type="button"
          onClick={isRecording ? stop : start}
          disabled={disabled}
          aria-pressed={isRecording}
          className={`nb-press flex h-12 w-12 shrink-0 items-center justify-center border-[3px] border-ink shadow-[4px_4px_0_var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-50 ${
            isRecording ? "bg-card" : "bg-punch"
          }`}
        >
          <span
            aria-hidden
            className={
              isRecording ? "h-3.5 w-3.5 bg-ink" : "h-3.5 w-3.5 rounded-full bg-ink"
            }
          />
          <span className="sr-only">{isRecording ? "Stop recording" : "Start recording"}</span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-black uppercase tracking-tight">
              {isRecording ? (
                <>
                  Recording<span className="animate-blink">_</span>
                </>
              ) : (
                "Record from mic"
              )}
            </span>
            <span className="border-2 border-ink bg-card px-1.5 font-mono text-[11px] font-bold tabular-nums">
              {isRecording ? formatClock(elapsed) : "0:00"}
            </span>
          </div>

          {/* Level meter — solid blocks, driven by real RMS so silence shows. */}
          <div
            aria-hidden
            className="mt-2.5 flex h-6 items-end gap-[3px] border-2 border-ink bg-card p-1"
          >
            {Array.from({ length: BAR_COUNT }).map((_, index) => {
              const threshold = (index + 1) / BAR_COUNT;
              const lit = isRecording && level >= threshold * 0.85;
              return (
                <span
                  key={index}
                  className={`h-full flex-1 ${lit ? "bg-ink" : "bg-ink/15"}`}
                  style={{
                    transform: `scaleY(${
                      isRecording ? Math.max(0.16, Math.min(1, level / threshold)) : 0.16
                    })`,
                    transformOrigin: "bottom",
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 border-[3px] border-ink bg-punch px-3 py-2 text-xs font-bold"
        >
          {error}
        </p>
      )}
    </div>
  );
}

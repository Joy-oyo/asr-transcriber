"use client";

import { useId, useState } from "react";
import { formatBytes } from "@/lib/format";

const ACCEPT = "audio/*,video/*,.wav,.mp3,.m4a,.flac,.ogg,.opus,.webm,.mp4,.mov";

export default function Dropzone({
  file,
  disabled,
  onSelect,
}: {
  file: File | null;
  disabled?: boolean;
  onSelect: (file: File) => void;
}) {
  const inputId = useId();
  const [isOver, setIsOver] = useState(false);

  function handleFiles(files: FileList | null) {
    const next = files?.[0];
    if (next) onSelect(next);
  }

  return (
    <div
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(event) => {
        if (disabled) return;
        event.preventDefault();
        setIsOver(false);
        handleFiles(event.dataTransfer.files);
      }}
      className={`nb nb-shadow-sm ${
        isOver ? "bg-volt" : file ? "bg-mint" : "bg-card"
      } ${disabled ? "opacity-55" : ""}`}
    >
      <input
        id={inputId}
        type="file"
        accept={ACCEPT}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          handleFiles(event.target.files);
          // Allow re-selecting the same file after a reset.
          event.target.value = "";
        }}
      />

      <label
        htmlFor={inputId}
        className={`flex flex-col items-center gap-2.5 px-5 py-8 text-center ${
          disabled ? "cursor-not-allowed" : "cursor-pointer"
        }`}
      >
        <span
          aria-hidden
          className="flex h-11 w-11 items-center justify-center border-[3px] border-ink bg-volt text-xl font-black shadow-[3px_3px_0_var(--color-ink)]"
        >
          ↑
        </span>

        {file ? (
          <>
            <span className="max-w-full truncate text-sm font-black uppercase tracking-tight">
              {file.name}
            </span>
            <span className="font-mono text-[11px] font-bold uppercase tracking-wide opacity-65">
              {formatBytes(file.size)} · click to replace
            </span>
          </>
        ) : (
          <>
            <span className="text-sm font-black uppercase tracking-tight">
              Drop audio or video
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wide opacity-60">
              or click to browse
            </span>
            <span className="font-mono text-[10px] font-medium opacity-50">
              WAV · MP3 · M4A · FLAC · OGG · WEBM · MP4
            </span>
          </>
        )}
      </label>
    </div>
  );
}

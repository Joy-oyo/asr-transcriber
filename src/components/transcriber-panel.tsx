"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Dropzone from "@/components/dropzone";
import Recorder from "@/components/recorder";
import SegmentList from "@/components/segment-list";
import Stepper, { STEPS, type Step } from "@/components/stepper";
import { downloadTotals, useTranscriber } from "@/hooks/use-transcriber";
import { DEFAULT_MODEL_ID, LANGUAGES, MODELS, getModel } from "@/lib/models";
import {
  EXPORT_FORMATS,
  type ExportFormat,
  segmentsToText,
  serializeSegments,
  toSafeFileStem,
} from "@/lib/subtitles";
import { countWords, formatBytes, formatDuration } from "@/lib/format";
import type { Device } from "@/lib/types";

type Source = { blob: Blob; name: string; url: string };

/** Outlined card with a solid colour title bar — the shell for every section. */
function Panel({
  step,
  title,
  tone,
  aside,
  children,
  bodyClassName = "p-4 md:p-5",
}: {
  step: string;
  title: string;
  tone: string;
  aside?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section aria-label={title} className="nb nb-shadow">
      <div
        className={`flex flex-wrap items-center justify-between gap-2 border-b-[3px] border-ink ${tone} px-4 py-2.5`}
      >
        <h2 className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.16em]">
          <span className="border-2 border-ink bg-card px-1.5">{step}</span>
          {title}
        </h2>
        {aside}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Native select kept for accessibility, wrapped so the caret matches. */
function Select({
  id,
  label,
  value,
  disabled,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.14em]">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none border-[3px] border-ink bg-card px-3 py-2.5 pr-9 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {children}
        </select>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-center border-l-[3px] border-ink text-[10px] font-black"
        >
          ▼
        </span>
      </div>
    </div>
  );
}

/** Wizard footer button. `primary` marks the one action that moves forward. */
function NavButton({
  onClick,
  disabled,
  primary,
  className = "",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`nb-press border-[3px] border-ink uppercase disabled:cursor-not-allowed disabled:bg-paper disabled:opacity-55 ${
        primary
          ? "bg-volt px-5 py-3.5 text-sm font-black tracking-[0.14em] shadow-[6px_6px_0_var(--color-ink)]"
          : "bg-card px-3.5 py-2.5 text-[11px] font-extrabold tracking-[0.12em] shadow-[4px_4px_0_var(--color-ink)]"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export default function TranscriberPanel() {
  const { state, loadModel, transcribe, reset } = useTranscriber();

  const [requestedStep, setRequestedStep] = useState<Step>(1);
  const [hasRun, setHasRun] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [language, setLanguage] = useState<string>("auto");
  const [task, setTask] = useState<"transcribe" | "translate">("transcribe");
  const [preferWebGPU, setPreferWebGPU] = useState(false);
  const [gpuState, setGpuState] = useState<"checking" | "ready" | "unavailable">("checking");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("txt");
  const [copied, setCopied] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const regionRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(false);

  const model = getModel(modelId);
  const busy = state.status === "decoding" || state.status === "transcribing";
  const loadingModel = state.status === "loading-model";
  /**
   * No step changes while the worker owns the outcome. `state.running` is what
   * closes the gap a first run opens: weights download, the session builds, and
   * for a moment neither flag above is set even though the run is still live.
   */
  const locked = state.running || busy || loadingModel;

  /**
   * A step is reachable only once its input exists. Step 3 additionally waits
   * for a run to have started, so the rail never opens onto an empty panel.
   */
  const canVisit = useCallback(
    (step: Step) => {
      if (step === 1) return true;
      if (step === 2) return source !== null;
      return source !== null && hasRun;
    },
    [source, hasRun]
  );

  // Derived rather than stored, so clearing the audio cannot leave the wizard
  // parked on a step whose prerequisites just disappeared.
  const step: Step = canVisit(requestedStep) ? requestedStep : canVisit(2) ? 2 : 1;

  // Probe WebGPU once. Until the adapter request settles the UI says
  // "checking" rather than claiming a backend it has not confirmed.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => navigator.gpu?.requestAdapter() ?? null)
      .then((adapter) => {
        if (cancelled) return;
        setGpuState(adapter ? "ready" : "unavailable");
        if (adapter) setPreferWebGPU(true);
      })
      .catch(() => {
        if (!cancelled) setGpuState("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Object URLs are created in the handler below and released here on unmount,
  // which keeps them out of effect cleanups that StrictMode would re-run.
  useEffect(
    () => () => {
      objectUrlsRef.current.forEach(URL.revokeObjectURL);
      objectUrlsRef.current = [];
    },
    []
  );

  // The panel is swapped wholesale, so focus has to follow it — otherwise a
  // keyboard or screen-reader user is left pointing at a button that is gone.
  // Skipped on first paint to avoid stealing focus on page load.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    regionRef.current?.focus();
  }, [step]);

  const gpuReady = gpuState === "ready";
  const device: Device = preferWebGPU && gpuReady ? "webgpu" : "wasm";
  const progress = downloadTotals(state.downloads);
  const weightsCached = state.readyModelId === modelId;

  const goTo = useCallback(
    (next: Step) => {
      if (locked || !canVisit(next)) return;
      setRequestedStep(next);
    },
    [canVisit, locked]
  );

  const acceptSource = useCallback(
    (blob: Blob, name: string) => {
      // The <audio> element is about to point somewhere else, so the previous
      // clip can go immediately.
      objectUrlsRef.current.forEach(URL.revokeObjectURL);
      const url = URL.createObjectURL(blob);
      objectUrlsRef.current = [url];

      setSource({ blob, name, url });
      setCurrentTime(0);
      // New audio invalidates the old transcript, which closes step 3 again.
      setHasRun(false);
      reset();
    },
    [reset]
  );

  const startOver = useCallback(() => {
    objectUrlsRef.current.forEach(URL.revokeObjectURL);
    objectUrlsRef.current = [];
    setSource(null);
    setCurrentTime(0);
    setHasRun(false);
    setRequestedStep(1);
    reset();
  }, [reset]);

  const transcript = useMemo(() => segmentsToText(state.segments), [state.segments]);

  const speedFactor =
    state.elapsedMs && state.audioSeconds
      ? state.audioSeconds / (state.elapsedMs / 1000)
      : null;

  function run() {
    if (!source || locked) return;
    setHasRun(true);
    setRequestedStep(3);
    void transcribe(source.blob, {
      modelId,
      device,
      language: language === "auto" ? null : language,
      task,
    });
  }

  async function copyTranscript() {
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function download() {
    const spec = EXPORT_FORMATS.find((f) => f.id === exportFormat) ?? EXPORT_FORMATS[0];
    const body = serializeSegments(state.segments, exportFormat);
    const url = URL.createObjectURL(new Blob([body], { type: `${spec.mimeType};charset=utf-8` }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${toSafeFileStem(source?.name ?? "transcript")}.${spec.extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const statusLine = (() => {
    switch (state.status) {
      case "loading-model":
        if (progress.fileCount === 0) return "Fetching model metadata…";
        // Weights land well before the ONNX session is usable, so once bytes
        // are done we say so instead of sitting on a stalled "100%".
        return progress.percent < 100
          ? `Downloading weights · ${progress.percent}% (${formatBytes(progress.loaded)} of ${formatBytes(progress.total)})`
          : "Initializing model session…";
      case "decoding":
        return "Decoding audio to 16 kHz mono…";
      case "transcribing":
        return `Transcribing · ${state.percent}%`;
      case "done":
        return "Transcription complete.";
      case "ready":
        return "Model ready.";
      case "error":
        return null;
      default:
        return "Nothing loaded yet.";
    }
  })();

  const chipClass = "border-2 border-ink bg-card px-2 py-0.5 font-mono text-[10px] font-bold uppercase";
  const hintClass = "text-[11px] font-bold uppercase tracking-[0.1em] opacity-60";

  return (
    <div className="mx-auto max-w-3xl">
      <Stepper current={step} canVisit={canVisit} locked={locked} onSelect={goTo} />

      {/*
        One labelled region that swaps contents. The label carries the step
        position, so moving focus here on every change announces where you are.
      */}
      <div
        ref={regionRef}
        tabIndex={-1}
        role="group"
        aria-label={`Step ${step} of ${STEPS.length}: ${STEPS[step - 1].label}`}
        className="step-region"
      >
        {/* ── 01 · Audio ─────────────────────────────────────── */}
        {step === 1 && (
          <>
            <Panel step="01" title="Audio source" tone="bg-aqua">
              <div className="grid gap-3">
                <Dropzone
                  file={source?.blob instanceof File ? source.blob : null}
                  disabled={locked}
                  onSelect={(file) => acceptSource(file, file.name)}
                />

                <div className="flex items-center gap-3" aria-hidden>
                  <span className="h-[3px] flex-1 bg-ink" />
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.2em]">or</span>
                  <span className="h-[3px] flex-1 bg-ink" />
                </div>

                <Recorder
                  disabled={locked}
                  onClip={(clip) =>
                    acceptSource(
                      clip,
                      `recording-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`
                    )
                  }
                />

                {source && (
                  <div className="border-[3px] border-ink bg-mint px-3 py-3">
                    <p className="font-mono text-[11px] font-bold">
                      {source.name} · {formatBytes(source.blob.size)}
                    </p>
                    {/* Check you grabbed the right clip before spending a run. */}
                    <audio src={source.url} controls preload="metadata" className="mt-2.5" />
                  </div>
                )}
              </div>
            </Panel>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
              {!source && <p className={`mr-auto ${hintClass}`}>Add audio to continue</p>}
              <NavButton primary onClick={() => goTo(2)} disabled={!source}>
                Next · Model →
              </NavButton>
            </div>
          </>
        )}

        {/* ── 02 · Model ─────────────────────────────────────── */}
        {step === 2 && (
          <>
            <Panel step="02" title="Model" tone="bg-volt">
              <div className="grid gap-4">
                <div>
                  <Select
                    id="model"
                    label="Whisper checkpoint"
                    value={modelId}
                    disabled={locked}
                    onChange={setModelId}
                  >
                    {MODELS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label} · {option.size}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-2 text-xs font-medium leading-relaxed opacity-70">{model.note}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Select
                    id="language"
                    label="Language"
                    value={model.multilingual ? language : "en"}
                    disabled={locked || !model.multilingual}
                    onChange={setLanguage}
                  >
                    <option value="auto">Auto-detect</option>
                    {LANGUAGES.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </Select>

                  <Select
                    id="task"
                    label="Output"
                    value={model.multilingual ? task : "transcribe"}
                    disabled={locked || !model.multilingual}
                    onChange={(value) => setTask(value as "transcribe" | "translate")}
                  >
                    <option value="transcribe">Same language</option>
                    <option value="translate">Translate to English</option>
                  </Select>
                </div>

                {!model.multilingual && (
                  <p className="border-[3px] border-ink bg-tangerine px-3 py-2 text-[11px] font-bold">
                    English-only checkpoints ignore language and translation settings.
                  </p>
                )}

                <div
                  className={`flex items-center justify-between gap-4 border-[3px] border-ink px-3.5 py-3 ${
                    gpuReady ? "bg-mint" : "bg-paper"
                  }`}
                >
                  <label htmlFor="webgpu" className="text-xs font-black uppercase tracking-tight">
                    WebGPU
                    <span className="mt-0.5 block text-[10px] font-bold normal-case tracking-normal opacity-70">
                      {gpuState === "checking"
                        ? "Checking for a GPU adapter…"
                        : gpuReady
                          ? "Available — much faster than CPU."
                          : "No adapter here. Using WASM."}
                    </span>
                  </label>
                  <input
                    id="webgpu"
                    type="checkbox"
                    checked={preferWebGPU && gpuReady}
                    disabled={!gpuReady || locked}
                    onChange={(event) => setPreferWebGPU(event.target.checked)}
                    className="h-5 w-5 shrink-0 disabled:opacity-40"
                  />
                </div>

                {!weightsCached && (
                  <p className="border-[3px] border-ink bg-paper px-3 py-2 text-[11px] font-bold leading-relaxed">
                    First run downloads {model.size} of weights, then caches them in
                    this browser.
                  </p>
                )}
              </div>
            </Panel>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <NavButton onClick={() => goTo(1)} disabled={locked}>
                ← Audio
              </NavButton>

              {!weightsCached && (
                <NavButton onClick={() => loadModel(modelId, device)} disabled={locked}>
                  Preload weights
                </NavButton>
              )}

              <NavButton primary className="ml-auto" onClick={run} disabled={!source || locked}>
                {busy ? "Working…" : loadingModel ? "Loading model…" : "Transcribe →"}
              </NavButton>
            </div>
          </>
        )}

        {/* ── 03 · Transcript ────────────────────────────────── */}
        {step === 3 && (
          <>
            <Panel
              step="03"
              title="Transcript"
              tone="bg-punch"
              bodyClassName=""
              aside={
                <div className="flex items-center gap-1.5">
                  <span className={chipClass}>{state.device ?? device}</span>
                  {state.segments.length > 0 && (
                    <span className={chipClass}>{countWords(transcript)} words</span>
                  )}
                </div>
              }
            >
              <p
                role={state.status === "error" ? "alert" : "status"}
                aria-live="polite"
                className={`border-b-[3px] border-ink px-4 py-3 text-xs font-bold md:px-5 ${
                  state.status === "error" ? "bg-punch" : "bg-paper"
                }`}
              >
                {state.error ?? statusLine}
              </p>

              {/* Progress rail */}
              {locked && (
                <div className="h-4 w-full border-b-[3px] border-ink bg-card p-[3px]">
                  <div
                    className="h-full bg-ink transition-[width] duration-300"
                    style={{
                      width: `${
                        loadingModel ? Math.max(4, progress.percent) : Math.max(3, state.percent)
                      }%`,
                    }}
                  />
                </div>
              )}

              {source && (
                <div className="border-b-[3px] border-ink px-4 py-3 md:px-5">
                  {/* Native controls: fully keyboard accessible and zero extra JS. */}
                  <audio
                    ref={audioRef}
                    src={source.url}
                    controls
                    preload="metadata"
                    onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                  />
                </div>
              )}

              {state.segments.length > 0 ? (
                <>
                  <div className="max-h-[52vh] overflow-y-auto">
                    <SegmentList
                      segments={state.segments}
                      currentTime={currentTime}
                      onSeek={(seconds) => {
                        const audio = audioRef.current;
                        if (!audio) return;
                        audio.currentTime = seconds;
                        void audio.play().catch(() => undefined);
                      }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t-[3px] border-ink bg-paper px-4 py-3 md:px-5">
                    <button
                      type="button"
                      onClick={copyTranscript}
                      className={`nb-press border-[3px] border-ink px-3.5 py-2 text-[11px] font-extrabold uppercase tracking-[0.12em] shadow-[3px_3px_0_var(--color-ink)] ${
                        copied ? "bg-mint" : "bg-card"
                      }`}
                    >
                      {copied ? "Copied ✓" : "Copy text"}
                    </button>

                    <label htmlFor="format" className="sr-only">
                      Export format
                    </label>
                    <select
                      id="format"
                      value={exportFormat}
                      onChange={(event) => setExportFormat(event.target.value as ExportFormat)}
                      className="border-[3px] border-ink bg-card px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.12em] shadow-[3px_3px_0_var(--color-ink)]"
                    >
                      {EXPORT_FORMATS.map((format) => (
                        <option key={format.id} value={format.id}>
                          {format.label}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={download}
                      className="nb-press border-[3px] border-ink bg-volt px-3.5 py-2 text-[11px] font-extrabold uppercase tracking-[0.12em] shadow-[3px_3px_0_var(--color-ink)]"
                    >
                      Download ↓
                    </button>

                    {state.elapsedMs && (
                      <span className="ml-auto border-2 border-ink bg-card px-2 py-1 font-mono text-[10px] font-bold">
                        {formatDuration(state.elapsedMs / 1000)}
                        {speedFactor ? ` · ${speedFactor.toFixed(1)}× RT` : ""}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div className="px-5 py-14 text-center">
                  <p className="text-sm font-black uppercase tracking-tight">
                    {locked ? "Results stream in per block" : "No transcript yet"}
                  </p>
                  <p className="mx-auto mt-3 max-w-sm text-xs font-medium leading-relaxed opacity-65">
                    {locked
                      ? "Leave this tab open — everything runs on your machine, so the work stops if the page closes."
                      : "Step back to the model settings and start the run again."}
                  </p>
                </div>
              )}
            </Panel>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <NavButton onClick={() => goTo(2)} disabled={locked}>
                ← Model
              </NavButton>
              <NavButton className="ml-auto" onClick={startOver} disabled={locked}>
                Start over
              </NavButton>
            </div>

            {locked && <p className={`mt-3 ${hintClass}`}>Steps are locked while a run is active</p>}
          </>
        )}
      </div>
    </div>
  );
}

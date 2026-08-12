"use client";

export type Step = 1 | 2 | 3;

export const STEPS: { id: Step; label: string; tone: string }[] = [
  { id: 1, label: "Audio", tone: "bg-aqua" },
  { id: 2, label: "Model", tone: "bg-volt" },
  { id: 3, label: "Transcript", tone: "bg-punch" },
];

/**
 * Three-stop progress rail. Completed stops stay clickable so people can walk
 * back without losing state; everything is disabled while a run is in flight so
 * nobody navigates away from their own progress.
 */
export default function Stepper({
  current,
  canVisit,
  locked,
  onSelect,
}: {
  current: Step;
  canVisit: (step: Step) => boolean;
  locked: boolean;
  onSelect: (step: Step) => void;
}) {
  return (
    <nav aria-label="Progress" className="mb-5">
      <ol className="flex items-stretch">
        {STEPS.map((step, index) => {
          const isCurrent = step.id === current;
          const isDone = step.id < current;
          const reachable = !locked && canVisit(step.id) && !isCurrent;

          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center">
              <button
                type="button"
                onClick={() => reachable && onSelect(step.id)}
                disabled={!reachable}
                aria-current={isCurrent ? "step" : undefined}
                className={`nb-press flex min-w-0 flex-1 items-center gap-2 border-[3px] border-ink px-2.5 py-2 text-left shadow-[3px_3px_0_var(--color-ink)] ${
                  isCurrent
                    ? step.tone
                    : isDone
                      ? "bg-ink text-paper"
                      : "bg-card opacity-60"
                } ${reachable ? "cursor-pointer" : "cursor-default"}`}
              >
                <span
                  className={`shrink-0 border-2 px-1.5 font-mono text-[11px] font-black ${
                    isDone ? "border-paper bg-ink text-paper" : "border-ink bg-card"
                  }`}
                >
                  {isDone ? "✓" : `0${step.id}`}
                </span>
                <span className="truncate text-[11px] font-extrabold uppercase tracking-[0.12em]">
                  {step.label}
                </span>
              </button>

              {index < STEPS.length - 1 && (
                <span aria-hidden className="h-[3px] w-3 shrink-0 bg-ink sm:w-5" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

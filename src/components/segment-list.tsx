"use client";

import { useEffect, useRef } from "react";
import { formatClock } from "@/lib/format";
import type { Segment } from "@/lib/types";

export default function SegmentList({
  segments,
  currentTime,
  onSeek,
}: {
  segments: Segment[];
  currentTime: number;
  onSeek: (seconds: number) => void;
}) {
  const activeIndex = segments.findIndex(
    (segment) => currentTime >= segment.start && currentTime < segment.end
  );
  const activeRef = useRef<HTMLLIElement | null>(null);

  // Follow along during playback without yanking the page around.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  return (
    <ol>
      {segments.map((segment, index) => {
        const isActive = index === activeIndex;
        return (
          <li
            key={`${segment.start}-${index}`}
            ref={isActive ? activeRef : undefined}
            className="border-b-[3px] border-ink last:border-b-0"
          >
            <button
              type="button"
              onClick={() => onSeek(segment.start)}
              className={`flex w-full items-start gap-3.5 px-4 py-3 text-left transition-colors md:px-5 ${
                isActive ? "bg-volt" : "bg-card hover:bg-aqua/40"
              }`}
            >
              <span
                className={`shrink-0 border-2 border-ink px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums ${
                  isActive ? "bg-ink text-volt" : "bg-paper"
                }`}
              >
                {formatClock(segment.start)}
              </span>
              <span className="text-sm font-medium leading-relaxed">{segment.text}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

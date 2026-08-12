import { formatTimecode } from "./format";
import type { Segment } from "./types";

export type ExportFormat = "txt" | "srt" | "vtt" | "json";

export const EXPORT_FORMATS: {
  id: ExportFormat;
  label: string;
  extension: string;
  mimeType: string;
}[] = [
  { id: "txt", label: "Plain text", extension: "txt", mimeType: "text/plain" },
  { id: "srt", label: "SubRip", extension: "srt", mimeType: "application/x-subrip" },
  { id: "vtt", label: "WebVTT", extension: "vtt", mimeType: "text/vtt" },
  { id: "json", label: "JSON", extension: "json", mimeType: "application/json" },
];

export function segmentsToText(segments: Segment[]): string {
  return segments
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSrt(segments: Segment[]): string {
  return segments
    .map((s, i) => {
      const from = formatTimecode(s.start, ",");
      const to = formatTimecode(Math.max(s.end, s.start + 0.05), ",");
      return `${i + 1}\n${from} --> ${to}\n${s.text.trim()}\n`;
    })
    .join("\n");
}

function toVtt(segments: Segment[]): string {
  const cues = segments
    .map((s) => {
      const from = formatTimecode(s.start, ".");
      const to = formatTimecode(Math.max(s.end, s.start + 0.05), ".");
      return `${from} --> ${to}\n${s.text.trim()}\n`;
    })
    .join("\n");
  return `WEBVTT\n\n${cues}`;
}

export function serializeSegments(segments: Segment[], format: ExportFormat): string {
  switch (format) {
    case "srt":
      return toSrt(segments);
    case "vtt":
      return toVtt(segments);
    case "json":
      return JSON.stringify({ segments }, null, 2);
    case "txt":
    default:
      return segmentsToText(segments);
  }
}

/**
 * Strips characters that break filenames across platforms, then falls back to
 * a fixed stem so we never produce a dotfile or an empty name.
 */
export function toSafeFileStem(name: string): string {
  const stem = name.replace(/\.[^./\\]+$/, "");
  const cleaned = stem
    .replace(/[/\\?%*:|"<>\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 80)
    .trim();
  return cleaned || "transcript";
}

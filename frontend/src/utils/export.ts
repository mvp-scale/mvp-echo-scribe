import type { Segment, Paragraph, ExportFormat, ViewMode } from "../types";
import { formatTimestamp } from "./format-time";

// --- Line-by-line formatters (segment per entry) ---

function segmentsToSRT(segments: Segment[]): string {
  return segments
    .map((seg, i) => {
      const start = formatTimestamp(seg.start).replace(".", ",");
      const end = formatTimestamp(seg.end).replace(".", ",");
      const speaker = seg.speaker ? `[${seg.speaker}] ` : "";
      return `${i + 1}\n${start} --> ${end}\n${speaker}${seg.text.trim()}\n`;
    })
    .join("\n");
}

function segmentsToVTT(segments: Segment[]): string {
  const lines = segments.map((seg) => {
    const start = formatTimestamp(seg.start);
    const end = formatTimestamp(seg.end);
    const speaker = seg.speaker ? `<v ${seg.speaker}>` : "";
    return `${start} --> ${end}\n${speaker}${seg.text.trim()}\n`;
  });
  return `WEBVTT\n\n${lines.join("\n")}`;
}

function segmentsToTXT(segments: Segment[]): string {
  let txt = "";
  let lastSpeaker = "";
  for (const seg of segments) {
    const label = seg.speaker ?? "";
    if (label && label !== lastSpeaker) {
      txt += `\n${label}:\n`;
      lastSpeaker = label;
    }
    txt += `${seg.text.trim()} `;
  }
  return txt.trim();
}

function segmentsToJSON(segments: Segment[]): string {
  return JSON.stringify(
    segments.map((s) => ({
      start: s.start,
      end: s.end,
      speaker: s.speaker ?? undefined,
      text: s.text.trim(),
    })),
    null,
    2
  );
}

// --- Paragraph formatters (grouped entries) ---

function paragraphsToSRT(paragraphs: Paragraph[]): string {
  return paragraphs
    .map((p, i) => {
      const start = formatTimestamp(p.start).replace(".", ",");
      const end = formatTimestamp(p.end).replace(".", ",");
      const speaker = p.speaker ? `[${p.speaker}] ` : "";
      return `${i + 1}\n${start} --> ${end}\n${speaker}${p.text.trim()}\n`;
    })
    .join("\n");
}

function paragraphsToVTT(paragraphs: Paragraph[]): string {
  const lines = paragraphs.map((p) => {
    const start = formatTimestamp(p.start);
    const end = formatTimestamp(p.end);
    const speaker = p.speaker ? `<v ${p.speaker}>` : "";
    return `${start} --> ${end}\n${speaker}${p.text.trim()}\n`;
  });
  return `WEBVTT\n\n${lines.join("\n")}`;
}

function paragraphsToTXT(paragraphs: Paragraph[]): string {
  return paragraphs
    .map((p) => {
      const label = p.speaker ? `${p.speaker}:\n` : "";
      return `${label}${p.text.trim()}`;
    })
    .join("\n\n");
}

function paragraphsToJSON(paragraphs: Paragraph[]): string {
  return JSON.stringify(
    paragraphs.map((p) => ({
      start: p.start,
      end: p.end,
      speaker: p.speaker ?? undefined,
      text: p.text.trim(),
      segment_count: p.segment_count,
      ...(p.entity_counts && { entity_counts: p.entity_counts }),
      ...(p.sentiment && { sentiment: p.sentiment }),
    })),
    null,
    2
  );
}

// --- Main export function ---

export function exportTranscript(
  segments: Segment[],
  paragraphs: Paragraph[],
  viewMode: ViewMode,
  format: ExportFormat,
  filename: string
): void {
  let content: string;
  let mimeType: string;
  let ext: string;

  if (viewMode === "para" && paragraphs.length > 0) {
    switch (format) {
      case "srt":
        content = paragraphsToSRT(paragraphs);
        mimeType = "text/srt";
        ext = "srt";
        break;
      case "vtt":
        content = paragraphsToVTT(paragraphs);
        mimeType = "text/vtt";
        ext = "vtt";
        break;
      case "txt":
        content = paragraphsToTXT(paragraphs);
        mimeType = "text/plain";
        ext = "txt";
        break;
      case "json":
        content = paragraphsToJSON(paragraphs);
        mimeType = "application/json";
        ext = "json";
        break;
    }
  } else {
    switch (format) {
      case "srt":
        content = segmentsToSRT(segments);
        mimeType = "text/srt";
        ext = "srt";
        break;
      case "vtt":
        content = segmentsToVTT(segments);
        mimeType = "text/vtt";
        ext = "vtt";
        break;
      case "txt":
        content = segmentsToTXT(segments);
        mimeType = "text/plain";
        ext = "txt";
        break;
      case "json":
        content = segmentsToJSON(segments);
        mimeType = "application/json";
        ext = "json";
        break;
    }
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename.replace(/\.[^.]+$/, "")}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

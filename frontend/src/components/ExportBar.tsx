import type { Segment, Paragraph, ExportFormat, ViewMode } from "../types";
import { exportTranscript } from "../utils/export";

interface Props {
  segments: Segment[];
  paragraphs: Paragraph[];
  viewMode: ViewMode;
  filename: string;
}

const FORMATS: { format: ExportFormat; label: string }[] = [
  { format: "srt", label: "SRT" },
  { format: "vtt", label: "VTT" },
  { format: "txt", label: "TXT" },
  { format: "json", label: "JSON" },
];

export default function ExportBar({ segments, paragraphs, viewMode, filename }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 mr-1">Export:</span>
      {FORMATS.map(({ format, label }) => (
        <button
          key={format}
          onClick={() => exportTranscript(segments, paragraphs, viewMode, format, filename)}
          className="px-3 py-1.5 text-xs font-medium bg-surface-2 border border-border rounded-md
            text-gray-300 hover:text-white hover:border-border-light transition-colors"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

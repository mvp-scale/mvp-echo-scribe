import type { Segment } from "../types";
import { speakerColor, speakerName } from "./SpeakerBadge";
import { renderText } from "../utils/highlight-text";

interface Props {
  segment: Segment;
  isActive?: boolean;
  searchQuery?: string;
  onClickTimestamp?: (time: number) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 100);
  return `${m}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

export default function SpeakerSegment({
  segment,
  isActive,
  searchQuery,
  onClickTimestamp,
}: Props) {
  const color = segment.speaker
    ? speakerColor(segment.speaker, segment.originalSpeaker)
    : "var(--border)";

  return (
    <div
      className={`flex items-baseline gap-3 px-3.5 py-1.5 border-l-[3px] cursor-pointer transition-colors
        ${isActive ? "bg-mvp-blue/5" : "hover:bg-surface-2"}`}
      style={{ borderLeftColor: color }}
      onClick={() => onClickTimestamp?.(segment.start)}
    >
      {/* Speaker + timestamp (fixed width for alignment) */}
      <div className="flex items-baseline gap-2 shrink-0 w-[200px]">
        {segment.speaker && (
          <span className="text-xs font-bold truncate" style={{ color }}>
            {speakerName(segment.speaker)}
          </span>
        )}
        <span className="text-[10px] font-mono text-gray-500 whitespace-nowrap">
          {formatTime(segment.start)} &rarr; {formatTime(segment.end)}
        </span>
      </div>

      {/* Text */}
      <span className="text-[13px] leading-relaxed text-gray-200 min-w-0">
        {renderText(segment.text, searchQuery)}
      </span>
    </div>
  );
}

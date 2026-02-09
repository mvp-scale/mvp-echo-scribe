import type { Paragraph } from "../types";
import { speakerColor, speakerName } from "./SpeakerBadge";

interface Props {
  paragraphs: Paragraph[];
  currentTime: number;
  searchQuery: string;
  onClickTimestamp: (time: number) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 100);
  return `${m}:${String(s).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

function highlightText(text: string, query: string): JSX.Element {
  if (!query) return <>{text}</>;
  const regex = new RegExp(
    `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "gi"
  );
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-500/25 text-gray-200 rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function ParagraphView({
  paragraphs,
  currentTime,
  searchQuery,
  onClickTimestamp,
}: Props) {
  if (!paragraphs.length) return null;

  return (
    <div className="space-y-4 p-4">
      {paragraphs.map((para, i) => {
        const isActive = currentTime >= para.start && currentTime <= para.end;
        const color = para.speaker ? speakerColor(para.speaker, para.originalSpeaker) : "var(--border)";

        // Filter by search
        if (
          searchQuery &&
          !para.text.toLowerCase().includes(searchQuery.toLowerCase())
        ) {
          return null;
        }

        return (
          <div
            key={i}
            className={`p-3.5 rounded-lg border-l-[3px] cursor-pointer transition-colors
              ${isActive ? "bg-mvp-blue/5" : "bg-surface-2 hover:bg-surface-3"}`}
            style={{ borderLeftColor: color }}
            onClick={() => onClickTimestamp(para.start)}
          >
            <div className="flex items-center gap-2.5 mb-1.5">
              {para.speaker && (
                <span
                  className="text-xs font-bold"
                  style={{ color }}
                >
                  {speakerName(para.speaker)}
                </span>
              )}
              <span className="text-[10px] font-mono text-gray-500">
                {formatTime(para.start)} &rarr; {formatTime(para.end)}
              </span>
            </div>
            <div className="text-[13px] leading-relaxed text-gray-200">
              {highlightText(para.text, searchQuery)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

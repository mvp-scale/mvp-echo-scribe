import type { Segment } from "../types";
import { speakerColor } from "./SpeakerBadge";

interface Props {
  segments: Segment[];
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
}

export default function SpeakerTimeline({
  segments,
  duration,
  currentTime,
  onSeek,
}: Props) {
  if (!segments.length || duration <= 0) return null;

  const playheadPct = (currentTime / duration) * 100;

  return (
    <div className="px-5 py-2 bg-surface-0 border-b border-border">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
        Speaker Timeline
      </div>
      <div
        className="h-5 bg-surface-3 rounded relative overflow-hidden cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          onSeek(pct * duration);
        }}
      >
        {segments.map((seg, i) => {
          if (!seg.speaker) return null;
          const left = (seg.start / duration) * 100;
          const width = ((seg.end - seg.start) / duration) * 100;
          return (
            <div
              key={i}
              className="absolute top-0 h-full rounded-sm opacity-70 hover:opacity-100 transition-opacity"
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 0.3)}%`,
                background: speakerColor(seg.speaker, seg.originalSpeaker),
              }}
              title={`${seg.speaker} ${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s`}
            />
          );
        })}
        {/* Playhead */}
        <div
          className="absolute top-0 w-0.5 h-full bg-white z-10 pointer-events-none"
          style={{ left: `${playheadPct}%` }}
        />
      </div>
    </div>
  );
}

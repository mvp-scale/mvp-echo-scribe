import type { Statistics } from "../types";
import { speakerColor, speakerName } from "./SpeakerBadge";

interface Props {
  statistics: Statistics;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function SpeakerStats({ statistics }: Props) {
  const speakers = Object.entries(statistics.speakers).sort(
    ([, a], [, b]) => b.percentage - a.percentage
  );

  return (
    <div className="flex gap-5 flex-wrap px-5 py-3 bg-surface-2 border-b border-border">
      {speakers.map(([speaker, stats]) => {
        const color = speakerColor(speaker);
        return (
          <div key={speaker} className="flex-1 min-w-[120px]">
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: color }}
              />
              <span className="text-xs font-semibold" style={{ color }}>
                {speakerName(speaker)}
              </span>
            </div>
            <div className="text-[11px] text-gray-500 leading-relaxed">
              {formatDuration(stats.duration)} ({stats.percentage}%) &middot;{" "}
              {stats.word_count} words
            </div>
            <div className="h-1 bg-surface-3 rounded-sm mt-1">
              <div
                className="h-full rounded-sm"
                style={{
                  width: `${stats.percentage}%`,
                  background: color,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

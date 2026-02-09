const COLORS = [
  "var(--speaker-0)",
  "var(--speaker-1)",
  "var(--speaker-2)",
  "var(--speaker-3)",
  "var(--speaker-4)",
  "var(--speaker-5)",
  "var(--speaker-6)",
  "var(--speaker-7)",
];

function speakerIndex(speaker: string): number {
  const match = speaker.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) % COLORS.length : 0;
}

/** Get color for a speaker. Uses originalSpeaker (raw ID) when available so
 *  renamed speakers keep their original color. */
export function speakerColor(speaker: string, originalSpeaker?: string): string {
  return COLORS[speakerIndex(originalSpeaker ?? speaker)];
}

export function speakerName(speaker: string): string {
  const match = speaker.match(/(\d+)$/);
  if (match) {
    return `Speaker ${parseInt(match[1], 10) + 1}`;
  }
  return speaker;
}

interface Props {
  speaker: string;
  originalSpeaker?: string;
}

export default function SpeakerBadge({ speaker, originalSpeaker }: Props) {
  const color = speakerColor(speaker, originalSpeaker);
  return (
    <span
      className="speaker-badge whitespace-nowrap"
      style={{ backgroundColor: `${color}22`, color }}
    >
      {speakerName(speaker)}
    </span>
  );
}

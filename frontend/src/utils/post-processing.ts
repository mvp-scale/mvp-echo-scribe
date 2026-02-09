import type { Segment, Paragraph, TextRule, TranscriptionOptions } from "../types";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function applyTextRules(text: string, rules: TextRule[]): string {
  let result = text;
  for (const rule of rules) {
    if (!rule.enabled || !rule.find) continue;
    try {
      // Use per-rule flags, default to "gi" if not specified
      const flags = rule.flags || "gi";
      // Ensure "g" is always present so replace hits all occurrences
      const safeFlags = flags.includes("g") ? flags : "g" + flags;
      const pattern = rule.isRegex
        ? new RegExp(rule.find, safeFlags)
        : new RegExp("\\b" + escapeRegex(rule.find) + "\\b", safeFlags);
      result = result.replace(pattern, rule.replace);
    } catch {
      // Skip rules with invalid regex
    }
  }
  // Cleanup: collapse multi-spaces, fix orphaned commas
  result = result.replace(/ {2,}/g, " ").replace(/,\s*,/g, ",").trim();
  return result;
}

export function applyPostProcessing(
  rawSegments: Segment[],
  rawParagraphs: Paragraph[],
  options: TranscriptionOptions
): { segments: Segment[]; paragraphs: Paragraph[] } {
  // Work on copies so we don't mutate the originals from the API
  let segments = rawSegments.map((s) => ({ ...s, originalSpeaker: s.speaker }));
  let paragraphs = rawParagraphs.map((p) => ({ ...p, originalSpeaker: p.speaker }));

  // 1. Custom speaker labels (originalSpeaker preserves the raw ID for color lookup)
  if (Object.keys(options.speakerLabels).length > 0) {
    segments = segments.map((s) => ({
      ...s,
      speaker: s.speaker && options.speakerLabels[s.speaker]
        ? options.speakerLabels[s.speaker]
        : s.speaker,
    }));
    paragraphs = paragraphs.map((p) => ({
      ...p,
      speaker: p.speaker && options.speakerLabels[p.speaker]
        ? options.speakerLabels[p.speaker]
        : p.speaker,
    }));
  }

  // 2. Apply text rules filtered by active category (only if enabled)
  if (!options.textRulesEnabled) return { segments, paragraphs };
  const activeRules = options.textRules.filter((r) =>
    r.enabled && r.find && (options.textRuleCategory === "all" || r.category === options.textRuleCategory)
  );
  if (activeRules.length > 0) {
    segments = segments.map((s) => ({ ...s, text: applyTextRules(s.text, activeRules) }));
    paragraphs = paragraphs.map((p) => ({ ...p, text: applyTextRules(p.text, activeRules) }));
  }

  return { segments, paragraphs };
}

import type { Segment, Paragraph, TranscriptionOptions } from "../types";

const FILLER_PATTERN = /\b(?:you know|i mean|sort of|kind of|like|um|uh)\b/gi;
const MULTI_SPACE = / {2,}/g;

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

  // 2. Find & replace
  if (options.findReplace.length > 0) {
    const rules = options.findReplace
      .filter((r) => r.find.trim())
      .map((r) => ({
        pattern: new RegExp(
          "\\b" + r.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b",
          "gi"
        ),
        replace: r.replace,
      }));

    if (rules.length > 0) {
      const applyRules = (text: string) => {
        let result = text;
        for (const rule of rules) {
          result = result.replace(rule.pattern, rule.replace);
        }
        return result;
      };
      segments = segments.map((s) => ({ ...s, text: applyRules(s.text) }));
      paragraphs = paragraphs.map((p) => ({ ...p, text: applyRules(p.text) }));
    }
  }

  // 3. Remove filler words
  if (options.removeFillers) {
    const cleanFillers = (text: string) =>
      text
        .replace(FILLER_PATTERN, "")
        .replace(MULTI_SPACE, " ")
        .replace(/,\s*,/g, ",")
        .trim();
    segments = segments.map((s) => ({ ...s, text: cleanFillers(s.text) }));
    paragraphs = paragraphs.map((p) => ({ ...p, text: cleanFillers(p.text) }));
  }

  return { segments, paragraphs };
}

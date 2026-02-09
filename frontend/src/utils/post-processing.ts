import type { Segment, Paragraph, TextRule, TranscriptionOptions } from "../types";

/**
 * Client-side paragraph detection — groups segments by speaker turn and silence gaps.
 * Mirrors backend detect_paragraphs() so the threshold slider is reactive.
 */
export function detectParagraphsClient(
  segments: Segment[],
  silenceThreshold: number
): Paragraph[] {
  if (segments.length === 0) return [];

  const paragraphs: Paragraph[] = [];
  let current = {
    speaker: segments[0].speaker,
    start: segments[0].start,
    end: segments[0].end,
    texts: [segments[0].text.trim()],
    segmentCount: 1,
  };

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const silenceGap = seg.start - current.end;
    const speakerChanged = seg.speaker !== current.speaker;

    if (speakerChanged || silenceGap > silenceThreshold) {
      paragraphs.push({
        speaker: current.speaker,
        start: current.start,
        end: current.end,
        text: current.texts.join(" "),
        segment_count: current.segmentCount,
      });
      current = {
        speaker: seg.speaker,
        start: seg.start,
        end: seg.end,
        texts: [seg.text.trim()],
        segmentCount: 1,
      };
    } else {
      current.end = seg.end;
      current.texts.push(seg.text.trim());
      current.segmentCount++;
    }
  }

  // Push final paragraph
  paragraphs.push({
    speaker: current.speaker,
    start: current.start,
    end: current.end,
    text: current.texts.join(" "),
    segment_count: current.segmentCount,
  });

  return paragraphs;
}

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

  // 1. Client-side paragraph detection (reactive to threshold changes)
  // Re-detect from raw segments so the slider works live
  let paragraphs: Paragraph[];
  if (options.detectParagraphs && rawSegments.length > 0) {
    paragraphs = detectParagraphsClient(rawSegments, options.paragraphSilenceThreshold)
      .map((p) => ({ ...p, originalSpeaker: p.speaker }));
    // Carry over entity_counts and sentiment from matching raw paragraphs by start time
    for (const p of paragraphs) {
      const match = rawParagraphs.find((rp) => Math.abs(rp.start - p.start) < 0.01);
      if (match) {
        if (match.entity_counts) p.entity_counts = match.entity_counts;
        if (match.sentiment) p.sentiment = match.sentiment;
      }
    }
  } else {
    paragraphs = rawParagraphs.map((p) => ({ ...p, originalSpeaker: p.speaker }));
  }

  // 2. Custom speaker labels (originalSpeaker preserves the raw ID for color lookup)
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

  // 3. Apply text rules filtered by active category (only if enabled)
  if (options.textRulesEnabled) {
    const activeRules = options.textRules.filter((r) =>
      r.enabled && r.find && (options.textRuleCategory === "all" || r.category === options.textRuleCategory)
    );
    if (activeRules.length > 0) {
      segments = segments.map((s) => ({ ...s, text: applyTextRules(s.text, activeRules) }));
      paragraphs = paragraphs.map((p) => ({ ...p, text: applyTextRules(p.text, activeRules) }));
    }
  }

  return { segments, paragraphs };
}

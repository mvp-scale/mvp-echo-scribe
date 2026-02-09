"""Post-processing pipeline for transcription segments.

Functions for paragraph detection, filler removal, find/replace,
confidence filtering, speaker statistics, and speaker label mapping.
"""

import re
import logging
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)


def detect_paragraphs(segments: list, silence_threshold: float = 0.8) -> List[dict]:
    """Group consecutive same-speaker segments into paragraphs.

    Breaks on speaker change or silence gap exceeding threshold.

    Args:
        segments: List of WhisperSegment objects with start, end, text, speaker.
        silence_threshold: Seconds of silence that triggers a paragraph break.

    Returns:
        List of paragraph dicts with speaker, start, end, text, segment_count.
    """
    if not segments:
        return []

    sorted_segs = sorted(segments, key=lambda s: s.start)
    paragraphs = []

    current = {
        "speaker": sorted_segs[0].speaker,
        "start": sorted_segs[0].start,
        "end": sorted_segs[0].end,
        "texts": [sorted_segs[0].text.strip()],
        "segment_count": 1,
    }

    for seg in sorted_segs[1:]:
        silence_gap = seg.start - current["end"]
        speaker_changed = seg.speaker != current["speaker"]

        if speaker_changed or silence_gap > silence_threshold:
            # Close current paragraph
            paragraphs.append({
                "speaker": current["speaker"],
                "start": current["start"],
                "end": current["end"],
                "text": " ".join(current["texts"]),
                "segment_count": current["segment_count"],
            })
            # Start new paragraph
            current = {
                "speaker": seg.speaker,
                "start": seg.start,
                "end": seg.end,
                "texts": [seg.text.strip()],
                "segment_count": 1,
            }
        else:
            # Extend current paragraph
            current["end"] = seg.end
            current["texts"].append(seg.text.strip())
            current["segment_count"] += 1

    # Close final paragraph
    paragraphs.append({
        "speaker": current["speaker"],
        "start": current["start"],
        "end": current["end"],
        "text": " ".join(current["texts"]),
        "segment_count": current["segment_count"],
    })

    return paragraphs


# Filler word pattern: whole-word match, case-insensitive.
# Ordered longest-first so "you know" matches before "you".
_FILLER_PHRASES = [
    r"you know",
    r"i mean",
    r"sort of",
    r"kind of",
    r"like",
    r"um",
    r"uh",
]
_FILLER_PATTERN = re.compile(
    r"\b(?:" + "|".join(_FILLER_PHRASES) + r")\b",
    re.IGNORECASE,
)
# Collapse multiple spaces left after removal.
_MULTI_SPACE = re.compile(r"  +")


def remove_filler_words(segments: list) -> list:
    """Strip filler words from segment text in-place.

    Handles: uh, um, like, you know, I mean, sort of, kind of.
    Uses word-boundary matching to avoid false positives (e.g. "I like this").

    Note: "like" as a filler is hard to distinguish from "like" as a verb.
    The regex uses word boundaries which catches standalone "like" but also
    "I like this". For v0.2 this is acceptable — revisit if users report issues.
    """
    for seg in segments:
        cleaned = _FILLER_PATTERN.sub("", seg.text)
        cleaned = _MULTI_SPACE.sub(" ", cleaned).strip()
        # Fix orphaned punctuation from removal (e.g. ", , " -> ", ")
        cleaned = re.sub(r",\s*,", ",", cleaned)
        seg.text = cleaned
    return segments


def find_and_replace(segments: list, rules: List[Dict[str, str]]) -> list:
    """Apply user-defined find/replace rules to segment text.

    Each rule is {"find": "pattern", "replace": "replacement"}.
    Find patterns are escaped for regex safety, then matched as whole words,
    case-insensitive.

    Args:
        segments: List of WhisperSegment objects.
        rules: List of dicts with "find" and "replace" keys.

    Returns:
        The same segments list with text modified in-place.
    """
    compiled_rules = []
    for rule in rules:
        find = rule.get("find", "")
        replace = rule.get("replace", "")
        if find:
            try:
                pattern = re.compile(r"\b" + re.escape(find) + r"\b", re.IGNORECASE)
                compiled_rules.append((pattern, replace))
            except re.error as e:
                logger.warning(f"Invalid find/replace pattern '{find}': {e}")

    for seg in segments:
        for pattern, replacement in compiled_rules:
            seg.text = pattern.sub(replacement, seg.text)

    return segments


def filter_by_confidence(segments: list, min_confidence: float) -> list:
    """Remove segments below a confidence threshold.

    Confidence is computed as (1 - no_speech_prob). Segments with
    confidence below min_confidence are dropped.

    Args:
        segments: List of WhisperSegment objects.
        min_confidence: Minimum confidence threshold (0.0 to 1.0).

    Returns:
        Filtered list of segments.
    """
    if min_confidence <= 0.0:
        return segments

    filtered = []
    dropped = 0
    for seg in segments:
        confidence = 1.0 - seg.no_speech_prob
        if confidence >= min_confidence:
            filtered.append(seg)
        else:
            dropped += 1

    if dropped:
        logger.info(f"Confidence filter: dropped {dropped} segments below {min_confidence}")

    # Re-number segment IDs
    for i, seg in enumerate(filtered):
        seg.id = i

    return filtered


def compute_speaker_statistics(segments: list, total_duration: float) -> Optional[dict]:
    """Compute per-speaker talk time and word count.

    Args:
        segments: List of WhisperSegment objects with speaker labels.
        total_duration: Total audio duration in seconds.

    Returns:
        Dict with per-speaker stats and total_speakers count,
        or None if no speaker labels present.
    """
    speakers = {}
    has_speakers = False

    for seg in segments:
        if not seg.speaker or seg.speaker == "unknown":
            continue
        has_speakers = True
        if seg.speaker not in speakers:
            speakers[seg.speaker] = {"duration": 0.0, "word_count": 0}
        speakers[seg.speaker]["duration"] += seg.end - seg.start
        speakers[seg.speaker]["word_count"] += len(seg.text.split())

    if not has_speakers:
        return None

    total_talk = sum(s["duration"] for s in speakers.values())

    stats = {}
    for spk, data in speakers.items():
        percentage = (data["duration"] / total_talk * 100) if total_talk > 0 else 0
        stats[spk] = {
            "duration": round(data["duration"], 1),
            "percentage": round(percentage, 1),
            "word_count": data["word_count"],
        }

    return {
        "speakers": stats,
        "total_speakers": len(speakers),
    }


def apply_speaker_labels(segments: list, labels: Dict[str, str]) -> list:
    """Rename speaker IDs using a user-supplied mapping.

    Args:
        segments: List of WhisperSegment objects.
        labels: Mapping of original speaker ID to custom name,
                e.g. {"speaker_SPEAKER_00": "Alice"}.

    Returns:
        The same segments list with speakers renamed in-place.
    """
    for seg in segments:
        if seg.speaker and seg.speaker in labels:
            seg.speaker = labels[seg.speaker]
    return segments

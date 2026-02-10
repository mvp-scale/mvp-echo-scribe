"""Framework-agnostic domain models for MVP-Echo Studio.

These replace direct dependency on WhisperSegment (Pydantic DTO) inside
processing logic. WhisperSegment remains as the API response DTO, with
mappers at the boundary.
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class TranscriptSegment:
    """A single transcribed speech segment with timing and optional speaker."""
    start: float
    end: float
    text: str
    speaker: Optional[str] = None
    confidence: Optional[float] = None


@dataclass
class DiarizationSegment:
    """A speaker turn from the diarization pipeline."""
    start: float
    end: float
    speaker: str


@dataclass
class DiarizationResult:
    """Complete diarization output for an audio file."""
    segments: list[DiarizationSegment] = field(default_factory=list)
    num_speakers: int = 0

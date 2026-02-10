"""Domain <-> DTO mappers.

Converts between TranscriptSegment (domain) and WhisperSegment (Pydantic DTO).
API response schema stays unchanged.
"""

from domain.models import TranscriptSegment, DiarizationSegment, DiarizationResult
from models import WhisperSegment


def segment_to_dto(seg: TranscriptSegment, index: int = 0) -> WhisperSegment:
    """Convert a domain TranscriptSegment to a WhisperSegment DTO."""
    return WhisperSegment(
        id=index,
        start=seg.start,
        end=seg.end,
        text=seg.text,
        speaker=seg.speaker,
        no_speech_prob=1.0 - seg.confidence if seg.confidence is not None else 0.1,
    )


def dto_to_segment(dto: WhisperSegment) -> TranscriptSegment:
    """Convert a WhisperSegment DTO to a domain TranscriptSegment."""
    return TranscriptSegment(
        start=dto.start,
        end=dto.end,
        text=dto.text,
        speaker=dto.speaker,
        confidence=1.0 - dto.no_speech_prob,
    )


def segments_to_dtos(segments: list[TranscriptSegment]) -> list[WhisperSegment]:
    """Convert a list of domain segments to DTOs, preserving order."""
    return [segment_to_dto(seg, i) for i, seg in enumerate(segments)]


def dtos_to_segments(dtos: list[WhisperSegment]) -> list[TranscriptSegment]:
    """Convert a list of DTOs to domain segments."""
    return [dto_to_segment(dto) for dto in dtos]

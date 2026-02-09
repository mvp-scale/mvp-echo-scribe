from typing import List, Optional, Dict, Any
from pydantic import BaseModel


class WhisperSegment(BaseModel):
    """Represents a segment in the transcription"""
    id: int
    seek: int = 0
    start: float
    end: float
    text: str
    tokens: List[int] = []
    temperature: float = 0.0
    avg_logprob: float = 0.0
    compression_ratio: float = 1.0
    no_speech_prob: float = 0.1
    speaker: Optional[str] = None


class Paragraph(BaseModel):
    """A group of consecutive same-speaker segments."""
    speaker: Optional[str] = None
    start: float
    end: float
    text: str
    segment_count: int


class SpeakerStatistics(BaseModel):
    """Per-speaker talk time and word count."""
    duration: float
    percentage: float
    word_count: int


class Statistics(BaseModel):
    """Aggregate speaker statistics for the transcription."""
    speakers: Dict[str, SpeakerStatistics]
    total_speakers: int


class TranscriptionResponse(BaseModel):
    """Response format for transcription"""
    text: str
    segments: Optional[List[WhisperSegment]] = None
    language: Optional[str] = None
    task: str = "transcribe"
    duration: Optional[float] = None
    model: Optional[str] = None
    paragraphs: Optional[List[Paragraph]] = None
    statistics: Optional[Statistics] = None

    def dict(self, **kwargs):
        result = super().dict(**kwargs)
        if not self.segments:
            result.pop("segments", None)
        if not self.paragraphs:
            result.pop("paragraphs", None)
        if not self.statistics:
            result.pop("statistics", None)
        return result


class ModelInfo(BaseModel):
    id: str
    object: str = "model"
    created: int
    owned_by: str
    permission: List[Dict[str, Any]] = []
    root: str
    parent: Optional[str] = None


class ModelList(BaseModel):
    object: str = "list"
    data: List[ModelInfo]

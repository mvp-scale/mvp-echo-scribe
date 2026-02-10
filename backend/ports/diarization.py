"""DiarizationPort — abstract interface for speaker diarization."""

from abc import ABC, abstractmethod
from typing import Optional

from domain.models import TranscriptSegment, DiarizationResult


class DiarizationPort(ABC):
    @abstractmethod
    def load(self, **kwargs) -> None:
        """Load the diarization pipeline."""

    @abstractmethod
    def diarize(
        self,
        audio_path: str,
        num_speakers: Optional[int] = None,
        min_speakers: Optional[int] = None,
        max_speakers: Optional[int] = None,
    ) -> DiarizationResult:
        """Run speaker diarization on an audio file."""

    @abstractmethod
    def merge_with_transcription(
        self,
        diarization: DiarizationResult,
        segments: list[TranscriptSegment],
    ) -> list[TranscriptSegment]:
        """Overlay speaker labels onto transcription segments."""

    @abstractmethod
    def is_loaded(self) -> bool:
        """Whether the diarization pipeline is loaded and ready."""

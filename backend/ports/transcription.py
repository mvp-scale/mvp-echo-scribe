"""TranscriptionPort — abstract interface for ASR engines."""

from abc import ABC, abstractmethod
from typing import Optional

from domain.models import TranscriptSegment


class TranscriptionPort(ABC):
    @abstractmethod
    def load(self, model_id: str, device: str = "cuda") -> None:
        """Load the ASR model onto the specified device."""

    @abstractmethod
    def transcribe(
        self,
        audio_path: str,
        language: Optional[str] = None,
        word_timestamps: bool = False,
    ) -> tuple[str, list[TranscriptSegment]]:
        """Transcribe an audio file. Returns (full_text, segments)."""

    @abstractmethod
    def model_name(self) -> str:
        """Return the human-readable model name for API responses."""

    @abstractmethod
    def is_loaded(self) -> bool:
        """Whether the model has been loaded and is ready for inference."""

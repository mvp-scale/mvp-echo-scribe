"""AudioProcessingPort — abstract interface for audio preprocessing."""

from abc import ABC, abstractmethod


class AudioProcessingPort(ABC):
    @abstractmethod
    def convert_to_wav(self, input_path: str, sample_rate: int = 16000) -> str:
        """Convert audio to 16kHz mono WAV. Returns path to converted file."""

    @abstractmethod
    def split_into_chunks(
        self, audio_path: str, chunk_duration: int = 500
    ) -> list[str]:
        """Split audio into chunks. Returns list of chunk file paths."""

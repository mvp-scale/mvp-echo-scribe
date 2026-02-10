"""ProgressPort — abstract interface for reporting pipeline progress."""

from abc import ABC, abstractmethod
from typing import Optional


class ProgressPort(ABC):
    @abstractmethod
    def report(
        self,
        job_id: str,
        stage: str,
        progress: float = 0.0,
        detail: Optional[str] = None,
    ) -> None:
        """Report progress. stage: converting, transcribing, diarizing, post_processing."""

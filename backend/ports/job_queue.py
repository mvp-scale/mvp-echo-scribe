"""JobQueuePort — abstract interface for job submission and tracking."""

from abc import ABC, abstractmethod
from typing import Any, Optional


class JobQueuePort(ABC):
    @abstractmethod
    def submit(self, func: Any, *args, **kwargs) -> str:
        """Submit a callable for execution. Returns job ID."""

    @abstractmethod
    def status(self, job_id: str) -> str:
        """Return job status: 'pending', 'running', 'completed', 'failed'."""

    @abstractmethod
    def result(self, job_id: str) -> Optional[Any]:
        """Return job result if completed, None otherwise."""

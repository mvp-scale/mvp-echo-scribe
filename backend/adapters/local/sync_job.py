"""SyncJobAdapter — runs jobs inline (current behavior)."""

import uuid
from typing import Any, Optional

from ports.job_queue import JobQueuePort


class SyncJobAdapter(JobQueuePort):
    """Executes jobs synchronously. No queue, no background processing."""

    def __init__(self):
        self._results: dict[str, Any] = {}

    def submit(self, func: Any, *args, **kwargs) -> str:
        job_id = uuid.uuid4().hex[:12]
        result = func(*args, **kwargs)
        self._results[job_id] = result
        return job_id

    def status(self, job_id: str) -> str:
        return "completed" if job_id in self._results else "unknown"

    def result(self, job_id: str) -> Optional[Any]:
        return self._results.pop(job_id, None)

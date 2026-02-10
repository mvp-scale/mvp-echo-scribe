"""LogProgressAdapter — reports progress via logging (current behavior)."""

import logging
from typing import Optional

from ports.progress import ProgressPort

logger = logging.getLogger(__name__)


class LogProgressAdapter(ProgressPort):
    def report(
        self,
        job_id: str,
        stage: str,
        progress: float = 0.0,
        detail: Optional[str] = None,
    ) -> None:
        msg = f"[{job_id}] {stage}"
        if progress > 0:
            msg += f" {progress:.0%}"
        if detail:
            msg += f" — {detail}"
        logger.info(msg)

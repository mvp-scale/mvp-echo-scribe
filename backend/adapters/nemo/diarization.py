"""PyannoteDiarizationAdapter — wraps Pyannote 3.1 for speaker diarization."""

import os
import logging
from typing import Optional

from domain.models import TranscriptSegment, DiarizationSegment, DiarizationResult
from ports.diarization import DiarizationPort

logger = logging.getLogger(__name__)


class PyannoteDiarizationAdapter(DiarizationPort):
    def __init__(self):
        self._pipeline = None

    def load(self, access_token: Optional[str] = None, device: str = "cuda", **kwargs) -> None:
        import torch

        try:
            from pyannote.audio import Pipeline

            token = access_token or os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_ACCESS_TOKEN")
            if not token:
                logger.error("No HuggingFace token available. Diarization disabled.")
                return

            self._pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                use_auth_token=token,
            )
            actual_device = device if device == "cuda" and torch.cuda.is_available() else "cpu"
            self._pipeline.to(torch.device(actual_device))
            logger.info(f"Diarization pipeline initialized on {actual_device}")

        except ImportError:
            logger.error("pyannote.audio not installed")
        except Exception as e:
            logger.error(f"Failed to init diarization: {e}")

    def diarize(
        self,
        audio_path: str,
        num_speakers: Optional[int] = None,
        min_speakers: Optional[int] = None,
        max_speakers: Optional[int] = None,
    ) -> DiarizationResult:
        if self._pipeline is None:
            return DiarizationResult()

        try:
            diarization = self._pipeline(
                audio_path,
                num_speakers=num_speakers,
                min_speakers=min_speakers,
                max_speakers=max_speakers,
            )
            segments: list[DiarizationSegment] = []
            speakers: set[str] = set()

            for turn, _, speaker in diarization.itertracks(yield_label=True):
                speaker_id = speaker if isinstance(speaker, str) and speaker.startswith("SPEAKER_") else f"SPEAKER_{speaker}"
                segments.append(DiarizationSegment(
                    start=turn.start, end=turn.end, speaker=f"speaker_{speaker_id}"
                ))
                speakers.add(speaker_id)

            segments.sort(key=lambda x: x.start)
            return DiarizationResult(segments=segments, num_speakers=len(speakers))

        except Exception as e:
            logger.error(f"Diarization failed: {e}")
            return DiarizationResult()

    def merge_with_transcription(
        self,
        diarization: DiarizationResult,
        segments: list[TranscriptSegment],
    ) -> list[TranscriptSegment]:
        if not diarization.segments:
            return segments

        for segment in segments:
            overlapping: list[tuple[str, float]] = []
            for spk in diarization.segments:
                overlap_start = max(segment.start, spk.start)
                overlap_end = min(segment.end, spk.end)
                if overlap_end > overlap_start:
                    overlapping.append((spk.speaker, overlap_end - overlap_start))

            if overlapping:
                overlapping.sort(key=lambda x: x[1], reverse=True)
                segment.speaker = overlapping[0][0]
            else:
                segment.speaker = "unknown"

        return segments

    def is_loaded(self) -> bool:
        return self._pipeline is not None

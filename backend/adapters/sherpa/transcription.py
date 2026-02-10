"""SherpaTranscriptionAdapter — batch GPU ASR with token timestamps.

Splits audio into sub-chunks that fit the encoder's attention window (~100s max),
creates a stream per sub-chunk, then batch-decodes all streams on GPU in one call.
Token timestamps from each sub-chunk are offset-corrected and merged, then grouped
into sentence-like segments based on silence gaps.

Speaker diarization is handled separately by PyannoteDiarizationAdapter
(injected via config.py). Both use seconds-from-start timestamps, so the
merge step in the use case aligns them by time overlap.

Performance: ~5-7s for 18min audio on RTX 3090 (pure GPU, no CPU bottleneck).
"""

import logging
import os
from typing import Optional

import numpy as np
import soundfile

from domain.models import TranscriptSegment
from ports.transcription import TranscriptionPort

logger = logging.getLogger(__name__)

# Expected model files (downloaded by entrypoint-sherpa.sh from GitHub releases)
REQUIRED_FILES = {
    "asr": ["encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"],
}

DEFAULT_MODEL_DIR = "/models/sherpa-onnx"

# Max duration per sub-chunk (seconds). Parakeet TDT's self-attention supports
# ~1250 frames at 12.5 fps = 100s. Use 80s for safety margin.
MAX_CHUNK_SECONDS = 80

# Silence gap (seconds) between tokens that triggers a new segment.
# Lower values produce finer segments that align better with speaker turns.
SEGMENT_SILENCE_THRESHOLD = 0.25

# Max segment duration (seconds). Long segments span multiple speaker turns,
# causing diarization merge to assign the wrong speaker. Cap segments so they
# stay within a single speaker's utterance.
MAX_SEGMENT_DURATION = 6.0


class SherpaTranscriptionAdapter(TranscriptionPort):
    def __init__(self):
        self._model_dir = DEFAULT_MODEL_DIR
        self._recognizer = None
        self._ready = False

    def load(self, model_id: str = DEFAULT_MODEL_DIR, device: str = "cuda") -> None:
        """Load ASR model."""
        import sherpa_onnx

        self._model_dir = model_id
        self._ensure_models()

        logger.info(f"Loading Sherpa-ONNX ASR model (provider={device})...")
        self._recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
            encoder=os.path.join(self._model_dir, "encoder.int8.onnx"),
            decoder=os.path.join(self._model_dir, "decoder.int8.onnx"),
            joiner=os.path.join(self._model_dir, "joiner.int8.onnx"),
            tokens=os.path.join(self._model_dir, "tokens.txt"),
            model_type="nemo_transducer",
            provider=device,
            num_threads=4,
        )
        logger.info("ASR model loaded")

        self._ready = True
        logger.info(f"Sherpa transcription adapter ready: {self._model_dir}")

    def transcribe(
        self,
        audio_path: str,
        language: Optional[str] = None,
        word_timestamps: bool = False,
    ) -> tuple[str, list[TranscriptSegment]]:
        """Batch GPU ASR: sub-chunk audio → create streams → batch decode → merge tokens."""
        if not self._ready:
            logger.error("Sherpa adapter not loaded")
            return "", []

        try:
            # Step 1: Load audio
            logger.info(f"Loading audio: {audio_path}")
            audio, sample_rate = soundfile.read(audio_path, dtype="float32")

            if len(audio.shape) > 1:
                audio = audio.mean(axis=1)

            duration = len(audio) / sample_rate
            logger.info(f"Audio loaded: {duration:.2f}s @ {sample_rate}Hz")

            # Safety check: FFmpeg adapter should have converted to 16kHz mono
            if sample_rate != 16000:
                logger.warning(f"Audio is {sample_rate}Hz, expected 16000Hz")
                target_len = int(len(audio) * 16000 / sample_rate)
                indices = np.linspace(0, len(audio) - 1, target_len)
                audio = np.interp(indices, np.arange(len(audio)), audio).astype(np.float32)
                sample_rate = 16000

            # Step 2: Split into sub-chunks that fit the encoder's attention window
            chunk_samples = MAX_CHUNK_SECONDS * sample_rate
            num_chunks = max(1, int(np.ceil(len(audio) / chunk_samples)))

            streams = []
            chunk_offsets = []  # time offset (seconds) for each sub-chunk
            for i in range(num_chunks):
                start_sample = i * chunk_samples
                end_sample = min((i + 1) * chunk_samples, len(audio))
                chunk = audio[start_sample:end_sample]

                stream = self._recognizer.create_stream()
                stream.accept_waveform(sample_rate, chunk)
                streams.append(stream)
                chunk_offsets.append(start_sample / sample_rate)

            logger.info(f"Created {num_chunks} streams ({MAX_CHUNK_SECONDS}s sub-chunks)")

            # Step 3: Batch GPU decode — all sub-chunks in one call
            logger.info("Running batch GPU transcription...")
            self._recognizer.decode_streams(streams)
            logger.info("Batch transcription complete")

            # Step 4: Merge tokens + timestamps from all sub-chunks
            all_tokens = []
            all_timestamps = []
            all_text_parts = []

            for i, stream in enumerate(streams):
                result = stream.result
                offset = chunk_offsets[i]

                if result.tokens:
                    all_tokens.extend(result.tokens)
                    all_timestamps.extend(t + offset for t in result.timestamps)

                if result.text.strip():
                    all_text_parts.append(result.text.strip())

            full_text = " ".join(all_text_parts)

            if not full_text:
                logger.warning("No speech detected")
                return "", []

            logger.info(f"Got {len(all_tokens)} tokens with timestamps from {num_chunks} sub-chunks")

            # Step 5: Group tokens into segments based on silence gaps
            result_segments = self._group_tokens_into_segments(
                all_tokens, all_timestamps, duration
            )

            logger.info(
                f"Grouped into {len(result_segments)} segments, "
                f"{len(full_text)} characters"
            )
            return full_text, result_segments

        except Exception as e:
            logger.error(f"Sherpa transcription error: {e}", exc_info=True)
            return "", []

    def _group_tokens_into_segments(
        self,
        tokens: list,
        timestamps: list,
        audio_duration: float,
    ) -> list[TranscriptSegment]:
        """Group tokens into segments by detecting silence gaps between them.

        Each token has a timestamp (seconds from audio start). When the gap
        between consecutive tokens exceeds SEGMENT_SILENCE_THRESHOLD, a new
        segment starts. This produces natural sentence-like boundaries.
        """
        if not tokens:
            return []

        segments: list[TranscriptSegment] = []
        current_tokens: list[str] = [tokens[0]]
        current_start: float = timestamps[0]
        prev_timestamp: float = timestamps[0]

        for i in range(1, len(tokens)):
            gap = timestamps[i] - prev_timestamp
            segment_duration = timestamps[i] - current_start
            if gap > SEGMENT_SILENCE_THRESHOLD or segment_duration > MAX_SEGMENT_DURATION:
                # Flush current segment
                text = "".join(current_tokens).strip()
                if text:
                    segments.append(TranscriptSegment(
                        start=current_start,
                        end=prev_timestamp + 0.1,
                        text=text,
                        speaker=None,
                    ))
                # Start new segment
                current_tokens = [tokens[i]]
                current_start = timestamps[i]
            else:
                current_tokens.append(tokens[i])
            prev_timestamp = timestamps[i]

        # Flush final segment
        text = "".join(current_tokens).strip()
        if text:
            segments.append(TranscriptSegment(
                start=current_start,
                end=min(prev_timestamp + 0.1, audio_duration),
                text=text,
                speaker=None,
            ))

        return segments

    def model_name(self) -> str:
        return "parakeet-tdt-0.6b-v2-int8"

    def is_loaded(self) -> bool:
        return self._ready

    def _ensure_models(self):
        """Verify all required models are present (downloaded by entrypoint-sherpa.sh)."""
        missing = []
        for group, files in REQUIRED_FILES.items():
            for f in files:
                path = os.path.join(self._model_dir, f)
                if os.path.exists(path):
                    size_mb = os.path.getsize(path) / (1024 * 1024)
                    logger.info(f"  {group}: {f} ({size_mb:.1f} MB)")
                else:
                    missing.append(f)
                    logger.error(f"  {group}: {f} MISSING")

        if missing:
            raise FileNotFoundError(
                f"Missing model files in {self._model_dir}: {missing}. "
                f"Models should be downloaded by entrypoint-sherpa.sh on container start."
            )

        logger.info("All sherpa-onnx models verified")

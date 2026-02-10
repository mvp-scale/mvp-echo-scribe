"""SherpaTranscriptionAdapter — Python API with native diarization + batch GPU ASR.

Uses the 4-step pipeline for maximum GPU parallelization:
  1. Speaker Diarization (GPU): Segment audio by speaker
  2. Extract Clips: Create audio chunks for each speaker segment
  3. Batch ASR (GPU): Parallel transcription using decode_streams()
  4. Merge: Combine diarization + transcription into final segments

Performance: ~5-7s for 18min audio, <3min for 3-hour files on RTX 3090.
"""

import logging
import os
from typing import Optional

import numpy as np
import sherpa_onnx
import soundfile

from domain.models import TranscriptSegment
from ports.transcription import TranscriptionPort

logger = logging.getLogger(__name__)

# Expected model files (downloaded by entrypoint-sherpa.sh from GitHub releases)
REQUIRED_FILES = {
    "asr": ["encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt"],
    "segmentation": ["segmentation-3.0.onnx"],
    "embedding": ["3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx"],
}

DEFAULT_MODEL_DIR = "/models/sherpa-onnx"


class SherpaTranscriptionAdapter(TranscriptionPort):
    def __init__(self):
        self._model_dir = DEFAULT_MODEL_DIR
        self._diarization = None
        self._recognizer = None
        self._ready = False

    def load(self, model_id: str = DEFAULT_MODEL_DIR, device: str = "cuda") -> None:
        """Load diarization and ASR models."""
        self._model_dir = model_id
        self._ensure_models()

        # Load diarization pipeline
        logger.info("Loading Sherpa-ONNX diarization pipeline...")
        segmentation_config = sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
            pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(
                model=os.path.join(self._model_dir, "segmentation-3.0.onnx"),
            ),
            provider="cuda",
            num_threads=4,
        )

        embedding_config = sherpa_onnx.SpeakerEmbeddingExtractorConfig(
            model=os.path.join(
                self._model_dir,
                "3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx",
            ),
            provider="cuda",
            num_threads=4,
        )

        clustering_config = sherpa_onnx.FastClusteringConfig(
            threshold=0.5,
        )

        diarization_config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
            segmentation=segmentation_config,
            embedding=embedding_config,
            clustering=clustering_config,
        )

        self._diarization = sherpa_onnx.OfflineSpeakerDiarization(diarization_config)
        logger.info("Diarization pipeline loaded")

        # Load ASR model using high-level factory (handles config internally)
        logger.info("Loading Sherpa-ONNX ASR model...")
        self._recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
            encoder=os.path.join(self._model_dir, "encoder.int8.onnx"),
            decoder=os.path.join(self._model_dir, "decoder.int8.onnx"),
            joiner=os.path.join(self._model_dir, "joiner.int8.onnx"),
            tokens=os.path.join(self._model_dir, "tokens.txt"),
            model_type="nemo_transducer",
            provider="cuda",
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
        """Run 4-step pipeline: diarize → extract clips → batch ASR → merge."""
        if not self._ready:
            logger.error("Sherpa adapter not loaded")
            return "", []

        try:
            # Step 1: Load audio
            logger.info(f"Loading audio: {audio_path}")
            audio, sample_rate = soundfile.read(audio_path, dtype="float32")

            # Convert stereo to mono if needed
            if len(audio.shape) > 1:
                audio = audio.mean(axis=1)

            logger.info(f"Audio loaded: {len(audio)/sample_rate:.2f}s @ {sample_rate}Hz")

            # Step 2: Run diarization
            logger.info("Running speaker diarization...")
            diar_result = self._diarization.process(audio)
            diar_segments = list(diar_result.sort_by_start_time())
            logger.info(f"Diarization complete: {len(diar_segments)} segments")

            if not diar_segments:
                logger.warning("No diarization segments found")
                return "", []

            # Step 3: Extract clips and create streams
            logger.info("Creating ASR streams for each segment...")
            streams = []
            for seg in diar_segments:
                # Extract audio clip for this segment
                start_sample = int(seg.start * sample_rate)
                end_sample = int(seg.end * sample_rate)
                clip = audio[start_sample:end_sample]

                # Create stream and accept waveform
                stream = self._recognizer.create_stream()
                stream.accept_waveform(sample_rate, clip.tolist())
                streams.append(stream)

            logger.info(f"Created {len(streams)} streams")

            # Step 4: BATCH GPU decode (the speed trick!)
            logger.info("Running batch GPU transcription...")
            self._recognizer.decode_streams(streams)
            logger.info("Batch transcription complete")

            # Step 5: Merge results
            result_segments = []
            for i, seg in enumerate(diar_segments):
                text = streams[i].result.text.strip()
                if text:  # Only include non-empty segments
                    result_segments.append(
                        TranscriptSegment(
                            start=seg.start,
                            end=seg.end,
                            text=text,
                            speaker=f"speaker_SPEAKER_{seg.speaker:02d}",
                        )
                    )

            full_text = " ".join(seg.text for seg in result_segments)
            logger.info(
                f"Transcription complete: {len(result_segments)} segments, "
                f"{len(full_text)} characters"
            )
            return full_text, result_segments

        except Exception as e:
            logger.error(f"Sherpa transcription error: {e}", exc_info=True)
            return "", []

    def model_name(self) -> str:
        return "parakeet-tdt-0.6b-v2-int8+diarization"

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

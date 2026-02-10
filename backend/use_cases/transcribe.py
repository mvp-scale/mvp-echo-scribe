"""TranscribeAudioUseCase — orchestrates the full transcription pipeline.

Accepts all ports via dependency injection. With default local adapters,
behaves identically to the original monolithic api.py flow.
"""

import os
import json
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from domain.models import TranscriptSegment, DiarizationResult
from ports.transcription import TranscriptionPort
from ports.diarization import DiarizationPort
from ports.audio import AudioProcessingPort
from ports.progress import ProgressPort
from mappers import segments_to_dtos, dtos_to_segments
from models import (
    WhisperSegment, TranscriptionResponse,
    Paragraph, SpeakerStatistics, Statistics, Topic,
)
from post_processing import (
    detect_paragraphs, remove_filler_words, find_and_replace,
    apply_text_rules, filter_by_confidence, compute_speaker_statistics,
    apply_speaker_labels,
)
from entity_detection import extract_topics, annotate_paragraphs_with_entities
from sentiment_analysis import annotate_paragraphs_with_sentiment

logger = logging.getLogger(__name__)


@dataclass
class TranscribeRequest:
    """All parameters for a transcription request."""
    audio_path: str
    filename: str
    language: Optional[str] = None
    word_timestamps: bool = False
    response_format: str = "json"
    timestamps: bool = False
    diarize: bool = True
    include_diarization_in_text: bool = True
    num_speakers: Optional[int] = None
    min_speakers: Optional[int] = None
    max_speakers: Optional[int] = None
    detect_paragraphs_flag: bool = False
    paragraph_silence_threshold: float = 0.8
    remove_fillers: bool = False
    min_confidence: float = 0.0
    find_replace: Optional[str] = None
    text_rules: Optional[str] = None
    speaker_labels: Optional[str] = None
    detect_entities: bool = False
    detect_topics: bool = False
    detect_sentiment: bool = False
    chunk_duration: int = 500


class TranscribeAudioUseCase:
    def __init__(
        self,
        transcription: TranscriptionPort,
        diarization: Optional[DiarizationPort],
        audio: AudioProcessingPort,
        progress: ProgressPort,
    ):
        self._transcription = transcription
        self._diarization = diarization
        self._audio = audio
        self._progress = progress

    def execute(self, req: TranscribeRequest) -> tuple[TranscriptionResponse, list[WhisperSegment], str]:
        """Run the full pipeline. Returns (response, all_segments, full_text)."""
        job_id = uuid.uuid4().hex[:12]

        # 1. Convert audio
        self._progress.report(job_id, "converting")
        wav_file = self._audio.convert_to_wav(req.audio_path)

        # 2. Split into chunks if audio is long (prevents VRAM overflow)
        audio_chunks = self._audio.split_into_chunks(wav_file, chunk_duration=req.chunk_duration)

        # 3. Diarization + ASR (run in parallel when both are needed)
        diarization_result: Optional[DiarizationResult] = None
        run_separate_diarization = (
            req.diarize
            and self._diarization
            and self._diarization.is_loaded()
        )

        def _run_diarization() -> Optional[DiarizationResult]:
            self._progress.report(job_id, "diarizing")
            logger.info("Running speaker diarization (Pyannote)")
            result = self._diarization.diarize(
                wav_file,
                num_speakers=req.num_speakers,
                min_speakers=req.min_speakers,
                max_speakers=req.max_speakers,
            )
            logger.info(f"Found {result.num_speakers} speakers")
            return result

        def _run_asr() -> tuple[list[TranscriptSegment], list[str]]:
            self._progress.report(job_id, "transcribing")
            segments: list[TranscriptSegment] = []
            text_parts: list[str] = []
            for i, chunk_path in enumerate(audio_chunks):
                self._progress.report(
                    job_id, "transcribing",
                    progress=(i + 1) / len(audio_chunks),
                    detail=f"chunk {i + 1}/{len(audio_chunks)}",
                )
                logger.info(f"Processing chunk {i + 1}/{len(audio_chunks)}")
                chunk_text, chunk_segments = self._transcription.transcribe(
                    chunk_path, language=req.language, word_timestamps=req.word_timestamps,
                )
                if i > 0:
                    offset = i * req.chunk_duration
                    for seg in chunk_segments:
                        seg.start += offset
                        seg.end += offset
                text_parts.append(chunk_text)
                segments.extend(chunk_segments)
            return segments, text_parts

        if run_separate_diarization:
            # Diarization (Pyannote/PyTorch) and ASR (Sherpa/ORT) use independent
            # GPU frameworks with separate CUDA allocators.  Both release the GIL
            # during C++/CUDA kernels, so a ThreadPoolExecutor gives true overlap.
            logger.info("Running diarization + ASR in parallel")
            with ThreadPoolExecutor(max_workers=2) as pool:
                future_diar = pool.submit(_run_diarization)
                future_asr = pool.submit(_run_asr)
                diarization_result = future_diar.result()
                all_domain_segments, all_text_parts = future_asr.result()
        else:
            all_domain_segments, all_text_parts = _run_asr()

        # 5. Merge diarization speaker labels into ASR segments
        segments_need_speakers = all_domain_segments and not all_domain_segments[0].speaker
        if segments_need_speakers and diarization_result and diarization_result.segments:
            logger.info("Merging diarization speaker labels into transcription segments")
            all_domain_segments = self._diarization.merge_with_transcription(
                diarization_result, all_domain_segments
            )

        # Convert domain segments to DTOs for post-processing (which operates on WhisperSegment)
        all_segments = segments_to_dtos(all_domain_segments)

        # 6. Post-processing pipeline
        self._progress.report(job_id, "post_processing")

        # 6a. Confidence filtering
        if req.min_confidence > 0.0:
            all_segments = filter_by_confidence(all_segments, req.min_confidence)

        # 6b. Text rules or legacy filler/find-replace
        if req.text_rules:
            try:
                parsed_rules = json.loads(req.text_rules)
                if isinstance(parsed_rules, dict) and "rules" in parsed_rules:
                    parsed_rules = parsed_rules["rules"]
                if isinstance(parsed_rules, list):
                    logger.info(f"Applying {len(parsed_rules)} text rules to {len(all_segments)} segments")
                    all_segments = apply_text_rules(all_segments, parsed_rules)
            except json.JSONDecodeError:
                logger.warning("Invalid text_rules JSON, skipping")
        else:
            if req.remove_fillers:
                all_segments = remove_filler_words(all_segments)
            if req.find_replace:
                try:
                    rules = json.loads(req.find_replace)
                    if isinstance(rules, list):
                        all_segments = find_and_replace(all_segments, rules)
                except json.JSONDecodeError:
                    logger.warning("Invalid find_replace JSON, skipping")

        # 6c. Custom speaker labels
        labels_map = None
        if req.speaker_labels:
            try:
                labels_map = json.loads(req.speaker_labels)
                if isinstance(labels_map, dict):
                    all_segments = apply_speaker_labels(all_segments, labels_map)
            except json.JSONDecodeError:
                logger.warning("Invalid speaker_labels JSON, skipping")

        # 7. Rebuild full text
        if req.diarize and diarization_result and diarization_result.segments and req.include_diarization_in_text:
            previous_speaker = None
            text_parts: list[str] = []
            for seg in all_segments:
                if seg.speaker and seg.speaker != "unknown":
                    if seg.speaker != previous_speaker:
                        if labels_map and seg.speaker in labels_map.values():
                            display = seg.speaker
                        elif seg.speaker.startswith("speaker_"):
                            parts = seg.speaker.split("_")
                            try:
                                num = int(parts[-1]) + 1
                                display = f"Speaker {num}"
                            except (ValueError, IndexError):
                                display = seg.speaker
                        else:
                            display = seg.speaker
                        text_parts.append(f"{display}: {seg.text.strip()}")
                        previous_speaker = seg.speaker
                    else:
                        text_parts.append(seg.text.strip())
                else:
                    text_parts.append(seg.text.strip())
                    previous_speaker = None
            full_text = " ".join(text_parts)
        else:
            full_text = " ".join(seg.text.strip() for seg in all_segments)

        # 8. Duration
        duration = all_segments[-1].end if all_segments else 0.0

        # 9. Paragraph detection
        paragraphs_data = None
        if req.detect_paragraphs_flag and all_segments:
            raw_paragraphs = detect_paragraphs(all_segments, req.paragraph_silence_threshold)
            if req.detect_entities:
                annotate_paragraphs_with_entities(raw_paragraphs)
            if req.detect_sentiment:
                annotate_paragraphs_with_sentiment(raw_paragraphs)
            paragraphs_data = [Paragraph(**p) for p in raw_paragraphs]

        # 10. Speaker statistics
        statistics_data = None
        if req.diarize and diarization_result and diarization_result.segments:
            raw_stats = compute_speaker_statistics(all_segments, duration)
            if raw_stats:
                statistics_data = Statistics(
                    speakers={k: SpeakerStatistics(**v) for k, v in raw_stats["speakers"].items()},
                    total_speakers=raw_stats["total_speakers"],
                )

        # 11. Topic extraction
        topics_data = None
        if req.detect_topics and all_segments:
            raw_topics = extract_topics(all_segments)
            if raw_topics:
                topics_data = [Topic(**t) for t in raw_topics]

        # 12. Build response
        response = TranscriptionResponse(
            text=full_text,
            segments=all_segments if req.timestamps or req.response_format == "verbose_json" else None,
            language=req.language,
            duration=duration,
            model=self._transcription.model_name(),
            paragraphs=paragraphs_data,
            statistics=statistics_data,
            topics=topics_data,
        )

        # 13. Cleanup temp files
        try:
            if os.path.exists(req.audio_path):
                os.unlink(req.audio_path)
            if wav_file != req.audio_path and os.path.exists(wav_file):
                os.unlink(wav_file)
            for chunk in audio_chunks:
                if chunk != wav_file and os.path.exists(chunk):
                    os.unlink(chunk)
        except Exception as e:
            logger.warning(f"Cleanup error: {e}")

        return response, all_segments, full_text

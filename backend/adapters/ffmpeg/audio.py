"""FFmpegAudioAdapter — audio preprocessing via ffmpeg (shared by all stacks)."""

import os
import math
import wave
import logging
import tempfile
import subprocess

from ports.audio import AudioProcessingPort

logger = logging.getLogger(__name__)


class FFmpegAudioAdapter(AudioProcessingPort):
    def convert_to_wav(self, input_path: str, sample_rate: int = 16000) -> str:
        temp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        temp_file.close()
        output_path = temp_file.name

        try:
            cmd = [
                "ffmpeg", "-y",
                "-i", input_path,
                "-c:a", "pcm_s16le",
                "-ar", str(sample_rate),
                "-ac", "1",
                output_path,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                logger.error(f"Error converting audio: {result.stderr}")
                raise Exception(f"Failed to convert audio: {result.stderr}")
            return output_path

        except Exception:
            if os.path.exists(output_path):
                os.unlink(output_path)
            raise

    def split_into_chunks(self, audio_path: str, chunk_duration: int = 500) -> list[str]:
        try:
            with wave.open(audio_path, "rb") as wf:
                frames = wf.getnframes()
                rate = wf.getframerate()
                duration = frames / rate

            logger.info(f"Audio duration: {duration:.2f} seconds")

            if duration <= chunk_duration:
                return [audio_path]

            num_chunks = math.ceil(duration / chunk_duration)
            logger.info(f"Splitting audio into {num_chunks} chunks of {chunk_duration}s")

            temp_dir = tempfile.mkdtemp()
            chunk_paths: list[str] = []

            for i in range(num_chunks):
                start_time = i * chunk_duration
                output_path = os.path.join(temp_dir, f"chunk_{i}.wav")

                cmd = [
                    "ffmpeg", "-y",
                    "-ss", str(start_time),
                    "-i", audio_path,
                    "-t", str(chunk_duration),
                    "-c:a", "pcm_s16le",
                    "-ar", "16000",
                    "-ac", "1",
                    output_path,
                ]
                result = subprocess.run(cmd, capture_output=True, text=True)
                if result.returncode != 0:
                    logger.error(f"Error splitting chunk {i}: {result.stderr}")
                    raise Exception(f"Failed to split audio: {result.stderr}")

                chunk_paths.append(output_path)

            return chunk_paths

        except Exception as e:
            logger.error(f"Error splitting audio: {e}")
            return [audio_path]

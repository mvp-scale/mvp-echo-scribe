# MVP-Echo Studio - v0.3.0 Session Context

## Current State (2026-02-10)

**Status**: v0.3.0 — Hexagonal architecture refactor + Sherpa-ONNX backend
**Prior work**: See `ARCHIVE.md` for v0.2.0 feature completion log
**Benchmark**: 18-minute multi-speaker audio file, segment-level timestamps + speaker labels

---

## Goals

| Priority | Goal | Definition |
|----------|------|------------|
| P0 | **Accuracy** | Transcription quality parity — Sherpa-ONNX output matches NeMo output for same audio |
| P0 | **Speed** | 18-minute audio transcribed in <10s (target: 5s). Current NeMo baseline: ~15s on RTX 3090 |
| P1 | **Adaptability** | Engine-swappable architecture — switch NeMo/Sherpa via env var, no code changes |
| P1 | **Reliability** | Both stacks pass identical test suite against same benchmark audio |
| P2 | **Security** | Auth works across LAN, Tailscale, and Cloudflare tunnel deployments |
| P2 | **Resilience** | Graceful fallback if preferred engine fails to load (config error, missing model) |
| P3 | **Multi-user** | Concurrent request handling (deferred — requires Redis job queue, v0.4.0) |

---

## Phase 1: Hexagonal Foundation

**Goal**: Establish all ports (ML + infrastructure), domain models, and directory structure. Default adapters preserve current behavior. No external dependencies added — Redis adapters come in Phase 5.

### ML Ports (transcription engine boundary)

| Feature | Dependencies | Goals | Conf. | Status | Notes | Test Strategy |
|---------|-------------|-------|-------|--------|-------|---------------|
| **Domain models** | None | Adaptability | 🟢 | 📋 | `TranscriptSegment`, `DiarizationSegment` dataclasses in `domain/models.py`. Framework-agnostic. Replace internal use of `WhisperSegment`. | Import domain models, verify fields match current segment data. |
| **TranscriptionPort ABC** | `domain/models.py` | Adaptability | 🟢 | 📋 | Abstract interface: `load()`, `transcribe()`, `model_name()`. All adapters implement this. | ABC cannot be instantiated. Method signatures accept/return domain types. |
| **DiarizationPort ABC** | `domain/models.py` | Adaptability | 🟢 | 📋 | Abstract interface: `load()`, `diarize()`, `merge_with_transcription()`. Speaker hint params on `diarize()`. | ABC verification. Speaker hint params forwarded. |
| **AudioProcessingPort ABC** | None | Adaptability | 🟢 | 📋 | Abstract interface: `convert_to_wav()`, `split_into_chunks()`. Shared by both engine stacks. | ABC verification. |

### Infrastructure Ports (scalability boundary)

| Feature | Dependencies | Goals | Conf. | Status | Notes | Test Strategy |
|---------|-------------|-------|-------|--------|-------|---------------|
| **JobQueuePort ABC** | `domain/models.py` | Multi-user | 🟢 | 📋 | `submit(audio, options) -> job_id`, `status(job_id) -> JobStatus`, `result(job_id) -> TranscriptionResult`. Default: `SyncJobAdapter` runs inline (current behavior). Redis adapter in Phase 5. | Submit job, verify sync adapter returns result immediately. Status returns `completed`. |
| **RateLimiterPort ABC** | None | Security | 🟢 | 📋 | `check(api_key) -> bool`, `remaining(api_key) -> int`. Default: `NoOpRateLimiter` always returns True. Redis adapter in Phase 5. | Verify no-op never blocks. Interface ready for Redis swap. |
| **ProgressPort ABC** | None | Reliability | 🟢 | 📋 | `report(job_id, stage, progress)`. Stages: converting, transcribing, diarizing, post-processing. Default: `LogProgressAdapter` writes to stdout. WebSocket adapter in Phase 5. | Verify log lines emitted at each pipeline stage. |
| **KeyStorePort ABC** | None | Security | 🟢 | 📋 | `validate(key) -> bool`, `get_info(key) -> KeyInfo`. Default: `JsonFileKeyStore` wraps current `auth.py` logic. Redis adapter optional. | Validate known key returns True. Invalid key returns False. |
| **UsagePort ABC** | None | Reliability | 🟢 | 📋 | `log(api_key, metadata)`, `query(api_key) -> list[UsageRecord]`. Default: `NoOpUsageAdapter` discards. Redis adapter in Phase 5. | Verify no-op doesn't error. Interface ready for Redis swap. |

### Shared Foundation

| Feature | Dependencies | Goals | Conf. | Status | Notes | Test Strategy |
|---------|-------------|-------|-------|--------|-------|---------------|
| **Domain-to-DTO mappers** | `domain/models.py` | Reliability | 🟢 | 📋 | `mappers.py`: convert `TranscriptSegment` <-> `WhisperSegment`, preserve all fields. API response schema unchanged. | Round-trip: domain -> DTO -> domain produces identical data. |
| **Directory scaffolding** | None | Adaptability | 🟢 | 📋 | Create `domain/`, `ports/`, `adapters/nemo/`, `adapters/sherpa/`, `adapters/ffmpeg/`, `adapters/infra/`, `use_cases/`. | `import` each package succeeds. |

---

## Phase 2: Extract NeMo Adapters

**Goal**: Move existing NeMo/Pyannote code into adapter implementations. Pure refactor — current behavior preserved exactly. `api.py` shrinks from 394 lines to thin HTTP layer.

**Exit criteria**: `ENGINE=nemo docker compose up` produces identical output to current monolithic stack.

| Feature | Dependencies | Goals | Conf. | Status | Notes | Test Strategy |
|---------|-------------|-------|-------|--------|-------|---------------|
| **NeMoTranscriptionAdapter** | Phase 1, `transcription.py` | Accuracy, Adaptability | 🟢 | 📋 | Move `load_model()` + `transcribe_audio_chunk()` into `adapters/nemo/transcription.py`. Implement `TranscriptionPort`. Return `list[TranscriptSegment]`. | Transcribe benchmark. Output must match current NeMo byte-for-byte. |
| **PyannoteDiarizationAdapter** | Phase 1, `diarization/` | Accuracy, Adaptability | 🟢 | 📋 | Move `Diarizer` class into `adapters/nemo/diarization.py`. Implement `DiarizationPort`. Keep `torchaudio_compat/` as internal dependency. | Diarize benchmark. Speaker labels and boundaries match current output. |
| **FFmpegAudioAdapter** | Phase 1, `audio.py` | Adaptability | 🟢 | 📋 | Move `convert_audio_to_wav()` + `split_audio_into_chunks()` into `adapters/ffmpeg/audio.py`. Shared by both stacks. | Convert MP3/FLAC/M4A to WAV. Split 18min file. Verify chunk count. |
| **TranscribeAudioUseCase** | All ML + infra ports | Adaptability, Reliability | 🟢 | 📋 | Orchestration in `use_cases/transcribe.py`. Accepts all ports via constructor (ML + infra). Pipeline: rate check -> submit to job queue -> convert -> chunk -> transcribe (with progress) -> diarize -> post-process -> log usage. With default adapters, behaves identically to current sync flow. | Full pipeline: upload audio, get `verbose_json`. Compare against current output. |
| **Slim api.py** | Use case | Adaptability | 🟢 | 📋 | Thin HTTP layer: parse form params, call use case, return response. No model imports, no orchestration. Rate limiter + key store checked before use case. | All existing curl commands produce identical responses. |
| **Adapter factory** | All adapters, `config.py` | Adaptability | 🟢 | 📋 | `ENGINE` env var selects ML adapters. `INFRA` env var selects infra adapters (`local` default, `redis` for Phase 5). Startup log shows all loaded adapters. | `ENGINE=nemo INFRA=local` loads defaults. `ENGINE=invalid` shows clear error. |

---

## Phase 3: Sherpa-ONNX Adapters

**Goal**: Implement second engine stack. Same API, same output format, different runtime. Target: 18min < 10s (ideally 5s), <4GB VRAM.

**Exit criteria**: Both engines transcribe benchmark with comparable accuracy. Sherpa: <10s, <4GB VRAM.

| Feature | Dependencies | Goals | Conf. | Status | Notes | Test Strategy |
|---------|-------------|-------|-------|--------|-------|---------------|
| **Research spike** | None | Accuracy, Speed | 🟡 | 🔬 | Verify: ONNX model download, Python API for `OfflineRecognizer`, timestamp format, CUDA EP. Reference existing sherpa-onnx project. | Standalone run on benchmark. Record: output format, speed, VRAM. |
| **SherpaTranscriptionAdapter** | Phase 2, research spike | Accuracy, Speed | 🟡 | 📋 | Implement `TranscriptionPort` via `sherpa_onnx.OfflineRecognizer`. Load Parakeet TDT 0.6B ONNX. Parse timestamps into `list[TranscriptSegment]`. | Compare WER against NeMo. Measure latency. |
| **SherpaDiarizationAdapter** | Phase 2, research spike | Accuracy | 🟡 | 🔬 | Implement `DiarizationPort` via sherpa-onnx built-in diarization. No HF_TOKEN, no pyannote, no torchaudio shim. Quality vs Pyannote is key risk. | Compare speaker labels against Pyannote. Count mismatches. |
| **INT8 variant** | Sherpa transcription | Speed | 🟡 | 🔬 | `parakeet-tdt-0.6b-v2-int8` — quantized. Faster inference, lower VRAM. May sacrifice accuracy. | INT8 vs FP32: speed, VRAM, WER. Accept if WER delta < 1%. |
| **VAD integration** | Sherpa transcription | Accuracy | 🟡 | 🔬 | Built-in VAD could replace fixed 500s chunking. Silence-based splitting avoids mid-sentence cuts. | Long audio with VAD. Verify no mid-sentence cuts. Compare quality. |
| **Dockerfile.sherpa** | All Sherpa adapters | Adaptability, Speed | 🟢 | 📋 | Slim Python 3.12 (~2GB vs ~20GB). `sherpa-onnx`, `onnxruntime-gpu`, `ffmpeg`, `spacy`, `vaderSentiment`. No PyTorch, no NeMo. | `DOCKERFILE=Dockerfile.sherpa docker compose up`. Health passes. Benchmark runs. |
| **docker-compose integration** | Dockerfile, factory | Adaptability | 🟢 | 📋 | `DOCKERFILE` selects image. `ENGINE` selects adapters. `DOCKERFILE=Dockerfile.sherpa ENGINE=sherpa docker compose up`. | Both configs start cleanly. Same curl commands work. |

---

## Phase 4: Auth & Deployment Hardening

**Goal**: Fix auth for real-world deployments. Ensure both stacks deploy cleanly to remote hosts.

| Feature | Dependencies | Goals | Conf. | Status | Notes | Test Strategy |
|---------|-------------|-------|-------|--------|-------|---------------|
| **Tailscale CGNAT bypass** | `auth.py` | Security | 🟢 | 📋 | Add `ip_network("100.64.0.0/10")` to `PRIVATE_NETWORKS`. Tailscale uses CGNAT for all peer traffic. | Access from 100.65.x.x. No 401. Public IPs still require key. |
| **Cloudflare tunnel auth** | `auth.py`, `api.ts` | Security | 🟢 | 📋 | Backend: check `CF-Connecting-IP` header. Frontend: store API key in localStorage, send as `Bearer` on all requests. | Access through tunnel. Auth succeeds. Direct public access without key blocked. |
| **Startup health validation** | Adapter factory | Resilience | 🟢 | 📋 | Load adapters, smoke test with 1s silent audio. Log engine name. Missing model -> clean error, not cryptic traceback. | Start with missing files. Verify clear error naming the dependency. |
| **Engine info in /health** | `/health` endpoint | Reliability | 🟢 | 📋 | Response includes `engine` (`nemo`/`sherpa`), model name, VRAM usage. | `curl /health` shows engine. Compare NeMo vs Sherpa output. |
| **Remote deployment test** | All phases | Reliability | 🟢 | 📋 | Deploy Sherpa to second machine (currently failing 401). Full pipeline: upload, transcribe, diarize, export. | End-to-end on remote host. Benchmark produces valid output. |

---

## Phase 5: Redis Adapter Swap (v0.4.0)

**Goal**: Replace default no-op/sync infrastructure adapters with Redis-backed implementations. Ports already defined in Phase 1 — this phase is purely adapter implementation. Set `INFRA=redis` to activate.

**Exit criteria**: `INFRA=redis docker compose up` runs with Redis. `INFRA=local` still works without Redis. Same API, same frontend.

| Feature | Dependencies | Goals | Conf. | Status | Notes | Test Strategy |
|---------|-------------|-------|-------|--------|-------|---------------|
| **Redis container** | `docker-compose.yml` | Multi-user | 🟢 | 📋 | Add `redis:7-alpine` service. `redis-data` volume for persistence. `--appendonly yes`. Only started when `INFRA=redis`. | `docker compose up redis`. Verify connectivity from backend. |
| **RedisJobAdapter** | `JobQueuePort`, Redis, `rq`/`arq` | Multi-user | 🟢 | 📋 | Implements `JobQueuePort`. `submit()` enqueues to Redis via rq. `status()` polls job state. `result()` returns completed output. Upload returns job ID; client polls `/jobs/{id}`. | Upload 3 files concurrently. Verify parallel processing. Poll status endpoint. |
| **RedisRateLimiter** | `RateLimiterPort`, Redis | Security | 🟢 | 📋 | Implements `RateLimiterPort`. Redis INCR with TTL. Key: `ratelimit:{api_key}:{hour}`. 100/hr guest, unlimited named. 429 + `Retry-After`. | Spam guest key, verify 429 after 100. Named keys bypass. Counter resets hourly. |
| **RedisUsageAdapter** | `UsagePort`, Redis | Reliability | 🟢 | 📋 | Implements `UsagePort`. Sorted set `usage:{api_key}`. Stores: file_size, duration, features, processing_time. Optional daily JSON export. | Query usage for key. Verify all fields. Check Redis memory. |
| **WebSocketProgressAdapter** | `ProgressPort`, Redis pubsub, FastAPI WS | Reliability | 🟡 | 📋 | Implements `ProgressPort`. Worker publishes to Redis pubsub channel per job. Frontend subscribes via WebSocket. Shows: "Converting...", "Chunk 2/5", "Diarizing...". | Upload 20min file, verify real-time updates. Test disconnect/reconnect. |
| **`/jobs/{id}` endpoint** | `RedisJobAdapter` | Multi-user | 🟢 | 📋 | New API endpoint. Returns job status, progress, and result when complete. Only active when `INFRA=redis`. | Poll non-existent job -> 404. Poll in-progress -> status. Poll complete -> result. |
| **Model caching** | `/models` Docker volume | Speed | 🟢 | ✅ | Already working. Models cached in volume. ~10s GPU load on startup. No re-download. Not a port — Docker volume strategy. | Restart container. No re-download. Check load time. |

---

## Performance Targets

| Metric | NeMo Baseline (RTX 3090) | Sherpa-ONNX Target | Notes |
|--------|--------------------------|-------------------|-------|
| 18min transcription | ~15s | <10s (goal: 5s) | Same Parakeet TDT 0.6B, ONNX should be faster |
| Diarization | ~5s | TBD | Sherpa vs Pyannote quality is key risk |
| Peak VRAM | ~6GB | <4GB | ONNX Runtime typically uses less |
| Container image | ~20GB | ~2GB | Slim Python base vs NeMo container |
| Model download | ~8GB (NeMo + Pyannote) | ~600MB (ONNX) | Faster first-start |
| Cold start | ~10s | TBD | ONNX models typically load faster |
| WER delta | Baseline | <1% from NeMo | Same weights, near-identical expected |

---

## Goal

Refactor the backend to a hexagonal (ports and adapters) architecture so that the transcription and diarization engines are swappable. Two concrete adapters:

1. **NVIDIA NeMo** — current stack (Parakeet TDT 0.6B via NeMo + Pyannote 3.1)
2. **Sherpa-ONNX** — same Parakeet TDT 0.6B model as ONNX + sherpa-onnx built-in diarization

The frontend does not change. The API contract does not change. Only the backend internals get restructured.

---

## Why Hexagonal Architecture

The current backend has direct coupling between the API layer and specific ML frameworks:

- `api.py` directly calls `load_model()` from NeMo, instantiates `Diarizer` from Pyannote
- `transcription.py` imports `nemo.collections.asr` at module level
- `diarization/__init__.py` imports `pyannote.audio.Pipeline` at module level
- Configuration, model loading, and GPU management are all interleaved

This makes it impossible to swap engines without rewriting the orchestration layer. Hexagonal architecture solves this by defining **ports** (abstract interfaces) that the core application depends on, with **adapters** (concrete implementations) that can be swapped at startup.

---

## Architecture Design

```
                    ┌─────────────────────────────────┐
                    │         Driving Adapters         │
                    │  (HTTP API, CLI, WebSocket)      │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────▼──────────────────┐
                    │        Application Core          │
                    │                                  │
                    │  Use Cases (orchestration)       │
                    │  Domain Models (segments, etc.)  │
                    │  Ports (abstract interfaces)     │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────▼──────────────────┐
                    │        Driven Adapters           │
                    │                                  │
                    │  ┌─────────┐  ┌──────────────┐  │
                    │  │  NeMo   │  │ Sherpa-ONNX  │  │
                    │  │ Adapter │  │   Adapter    │  │
                    │  └─────────┘  └──────────────┘  │
                    │                                  │
                    │  ┌─────────┐  ┌──────────────┐  │
                    │  │Pyannote │  │ Sherpa-ONNX  │  │
                    │  │ Adapter │  │  Diarization │  │
                    │  └─────────┘  └──────────────┘  │
                    │                                  │
                    │  ┌─────────┐  ┌──────────────┐  │
                    │  │ FFmpeg  │  │    spaCy     │  │
                    │  │ Audio   │  │   Entities   │  │
                    │  └─────────┘  └──────────────┘  │
                    └─────────────────────────────────┘
```

---

## Ports (Abstract Interfaces)

### TranscriptionPort

```python
from abc import ABC, abstractmethod
from domain.models import TranscriptSegment

class TranscriptionPort(ABC):
    @abstractmethod
    def load(self, model_id: str, device: str = "cuda") -> None:
        """Load the ASR model onto the specified device."""

    @abstractmethod
    def transcribe(self, audio_path: str, timestamps: bool = True) -> list[TranscriptSegment]:
        """Transcribe an audio file and return segments."""

    @abstractmethod
    def model_name(self) -> str:
        """Return the human-readable model name for API responses."""
```

### DiarizationPort

```python
class DiarizationPort(ABC):
    @abstractmethod
    def load(self, **kwargs) -> None:
        """Load the diarization pipeline."""

    @abstractmethod
    def diarize(self, audio_path: str, num_speakers: int | None = None,
                min_speakers: int | None = None, max_speakers: int | None = None
                ) -> list[DiarizationSegment]:
        """Run speaker diarization on an audio file."""

    @abstractmethod
    def merge_with_transcription(self, segments: list[TranscriptSegment],
                                  diarization: list[DiarizationSegment]
                                  ) -> list[TranscriptSegment]:
        """Overlay speaker labels onto transcription segments."""
```

### AudioProcessingPort

```python
class AudioProcessingPort(ABC):
    @abstractmethod
    def convert_to_wav(self, input_path: str, output_path: str,
                       sample_rate: int = 16000) -> str:
        """Convert audio to WAV format."""

    @abstractmethod
    def split_into_chunks(self, audio_path: str, chunk_duration: int = 500
                          ) -> list[str]:
        """Split audio into chunks, return list of chunk file paths."""
```

---

## Domain Models

Framework-agnostic data structures used throughout the core:

```python
@dataclass
class TranscriptSegment:
    start: float
    end: float
    text: str
    speaker: str | None = None
    confidence: float | None = None

@dataclass
class DiarizationSegment:
    start: float
    end: float
    speaker: str
```

These replace the direct dependency on `WhisperSegment` (Pydantic model) inside processing logic. `WhisperSegment` remains as the API response DTO, with a mapper at the boundary.

---

## Adapters

### NeMo Transcription Adapter
- Wraps current `transcription.py` logic
- Imports `nemo.collections.asr`
- Returns `list[TranscriptSegment]` instead of raw NeMo output
- Requires: NVIDIA NeMo container, CUDA, ~6GB VRAM

### Sherpa-ONNX Transcription Adapter
- Uses `sherpa_onnx.OfflineRecognizer`
- Same Parakeet TDT 0.6B model as ONNX export
- Returns `list[TranscriptSegment]` (same interface)
- Requires: `sherpa-onnx` pip package, ONNX model files
- Can run on CPU or GPU (ONNX Runtime CUDA EP)
- Significantly less VRAM than NeMo

### Pyannote Diarization Adapter
- Wraps current `diarization/__init__.py` logic
- Requires: HF_TOKEN, pyannote gated model, torchaudio_compat shim
- Tied to NeMo stack (needs PyTorch + torchaudio shim)

### Sherpa-ONNX Diarization Adapter
- Uses sherpa-onnx built-in speaker diarization
- No HF_TOKEN needed, no pyannote, no torchaudio shim
- Tied to Sherpa-ONNX stack

### FFmpeg Audio Adapter
- Wraps current `audio.py` logic
- Shared between both stacks (ffmpeg is universal)

---

## Proposed Directory Structure

```
backend/
├── domain/
│   └── models.py                  # TranscriptSegment, DiarizationSegment, JobStatus (framework-agnostic)
│
├── ports/
│   ├── transcription.py           # TranscriptionPort ABC
│   ├── diarization.py             # DiarizationPort ABC
│   ├── audio.py                   # AudioProcessingPort ABC
│   ├── job_queue.py               # JobQueuePort ABC
│   ├── rate_limiter.py            # RateLimiterPort ABC
│   ├── progress.py                # ProgressPort ABC
│   ├── key_store.py               # KeyStorePort ABC
│   └── usage.py                   # UsagePort ABC
│
├── adapters/
│   ├── nemo/
│   │   ├── transcription.py       # NeMoTranscriptionAdapter
│   │   └── diarization.py         # PyannoteDiarizationAdapter
│   │
│   ├── sherpa/
│   │   ├── transcription.py       # SherpaTranscriptionAdapter
│   │   └── diarization.py         # SherpaDiarizationAdapter
│   │
│   ├── ffmpeg/
│   │   └── audio.py               # FFmpegAudioAdapter
│   │
│   ├── local/                     # Default infra adapters (no external deps)
│   │   ├── sync_job.py            # SyncJobAdapter (inline processing)
│   │   ├── noop_rate_limiter.py   # NoOpRateLimiter (unlimited)
│   │   ├── log_progress.py        # LogProgressAdapter (stdout)
│   │   ├── json_key_store.py      # JsonFileKeyStore (current auth.py logic)
│   │   └── noop_usage.py          # NoOpUsageAdapter (discards)
│   │
│   └── redis/                     # Redis infra adapters (Phase 5)
│       ├── redis_job.py           # RedisJobAdapter (rq background queue)
│       ├── redis_rate_limiter.py   # RedisRateLimiter (INCR + TTL)
│       ├── ws_progress.py         # WebSocketProgressAdapter (pubsub)
│       ├── redis_key_store.py     # RedisKeyStore (optional)
│       └── redis_usage.py         # RedisUsageAdapter (sorted sets)
│
├── use_cases/
│   └── transcribe.py              # TranscribeAudioUseCase (orchestration, all ports injected)
│
├── api.py                         # FastAPI routes (thin, delegates to use cases)
├── models.py                      # Pydantic DTOs for API request/response
├── mappers.py                     # Domain <-> DTO conversions
├── config.py                      # Configuration + adapter selection (ENGINE + INFRA)
├── auth.py                        # Auth middleware (delegates to KeyStorePort)
├── main.py                        # Entry point (unchanged)
│
├── post_processing.py             # Unchanged (operates on domain models)
├── entity_detection.py            # Unchanged
├── sentiment_analysis.py          # Unchanged
│
└── torchaudio_compat/             # Unchanged (internal to NeMo adapter stack)
```

---

## Adapter Selection

Controlled via environment variable or docker-compose profile:

```yaml
# docker-compose.yml
services:
  mvp-scribe:
    environment:
      - ENGINE=nemo          # or "sherpa"
      - INFRA=local          # or "redis"
```

At startup, `config.py` reads `ENGINE` + `INFRA` and wires all adapters:

```python
def create_ml_adapters(engine: str) -> tuple[TranscriptionPort, DiarizationPort]:
    if engine == "nemo":
        from adapters.nemo.transcription import NeMoTranscriptionAdapter
        from adapters.nemo.diarization import PyannoteDiarizationAdapter
        return NeMoTranscriptionAdapter(), PyannoteDiarizationAdapter()
    elif engine == "sherpa":
        from adapters.sherpa.transcription import SherpaTranscriptionAdapter
        from adapters.sherpa.diarization import SherpaDiarizationAdapter
        return SherpaTranscriptionAdapter(), SherpaDiarizationAdapter()

def create_infra_adapters(infra: str) -> InfraAdapters:
    if infra == "local":
        return InfraAdapters(
            job_queue=SyncJobAdapter(),
            rate_limiter=NoOpRateLimiter(),
            progress=LogProgressAdapter(),
            key_store=JsonFileKeyStore("/data/api-keys.json"),
            usage=NoOpUsageAdapter(),
        )
    elif infra == "redis":
        redis_client = Redis(host="redis", port=6379)
        return InfraAdapters(
            job_queue=RedisJobAdapter(redis_client),
            rate_limiter=RedisRateLimiter(redis_client),
            progress=WebSocketProgressAdapter(redis_client),
            key_store=JsonFileKeyStore("/data/api-keys.json"),  # or RedisKeyStore
            usage=RedisUsageAdapter(redis_client),
        )
```

---

## Docker Strategy

### Option A: Two Dockerfiles (recommended)
- `Dockerfile.nemo` — current NeMo base image (~20GB), includes PyTorch, CUDA, torchaudio shim
- `Dockerfile.sherpa` — slim Python base (~2GB), includes sherpa-onnx, ONNX Runtime

```yaml
# docker-compose.yml
services:
  mvp-scribe:
    build:
      context: .
      dockerfile: ${DOCKERFILE:-Dockerfile.nemo}
```

Usage: `DOCKERFILE=Dockerfile.sherpa docker compose up -d --build`

### Option B: Single Dockerfile with build args
- Multi-stage with `--build-arg ENGINE=sherpa`
- More complex but single file to maintain

Option A is simpler and avoids bloating either image with unnecessary dependencies.

---

## What Stays the Same

| Component | Changes? | Notes |
|-----------|----------|-------|
| Frontend (React) | No | Same API contract |
| API contract (`/v1/audio/transcriptions`) | No | Same request/response schema |
| `auth.py` | No | Auth middleware stays as-is |
| `models.py` (Pydantic DTOs) | Minimal | Add mapper layer, keep API schema |
| `post_processing.py` | Minimal | Refactor to accept domain models |
| `entity_detection.py` | No | CPU-only, framework-independent |
| `sentiment_analysis.py` | No | CPU-only, framework-independent |
| Export formats (SRT/VTT/TXT/JSON) | No | Frontend-driven |

---

## What Changes

| Component | Current | After Refactor |
|-----------|---------|----------------|
| `transcription.py` | Direct NeMo imports | Becomes `adapters/nemo/transcription.py` |
| `diarization/__init__.py` | Direct Pyannote imports | Becomes `adapters/nemo/diarization.py` |
| `audio.py` | Direct ffmpeg subprocess | Becomes `adapters/ffmpeg/audio.py` |
| `api.py` (394 lines) | Orchestration + HTTP handling | Thin HTTP layer, delegates to `TranscribeAudioUseCase` |
| Model loading | Global variables in `api.py` | Managed by adapter lifecycle |
| `torchaudio_compat/` | Installed globally | Only loaded by NeMo adapter stack |

---

## Known Issues

### Auth: Tailscale + Cloudflare Tunnel (Phase 4)
Current `PRIVATE_NETWORKS` in `auth.py` doesn't include Tailscale CGNAT range (`100.64.0.0/10`). Traffic through Cloudflare tunnels arrives with public IP in `x-forwarded-for`, bypassing LAN check entirely. See Phase 4 table.

### Sherpa-ONNX Diarization Quality (Phase 3, key risk)
Pyannote 3.1 is best-in-class for speaker diarization. Sherpa-ONNX's built-in diarization is less proven. If quality is insufficient, hybrid approach possible: Sherpa-ONNX for transcription + Pyannote for diarization.

### Sherpa-ONNX Timestamp Format (Phase 3, research needed)
NeMo returns segment-level timestamps in `result.timestamp['segment']`. Sherpa-ONNX may return differently. Adapter must normalize to `TranscriptSegment` regardless.

---

## Sherpa-ONNX Research Checklist

- [ ] Verify sherpa-onnx diarization quality vs Pyannote 3.1
- [ ] Confirm Parakeet TDT 0.6B ONNX model output format (timestamps, segments)
- [ ] Test ONNX Runtime CUDA EP performance vs NeMo native
- [ ] Measure VRAM usage for sherpa-onnx GPU inference
- [ ] Check if INT8 model (`parakeet-tdt-0.6b-v2-int8`) is viable
- [ ] Determine if sherpa-onnx VAD can replace silence-based chunking
- [ ] Review existing sherpa-onnx project for implementation patterns

---

**Last Updated**: 2026-02-10

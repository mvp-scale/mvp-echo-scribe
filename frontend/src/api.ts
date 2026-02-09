import type { TranscriptionResponse, TranscriptionOptions, HealthResponse } from "./types";

const BASE = import.meta.env.DEV ? "" : "";

export async function transcribe(
  file: File,
  options: TranscriptionOptions
): Promise<TranscriptionResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("response_format", "verbose_json");
  form.append("diarize", String(options.diarize));

  // Diarization hints
  if (options.numSpeakers != null) {
    form.append("num_speakers", String(options.numSpeakers));
  }
  if (options.minSpeakers != null) {
    form.append("min_speakers", String(options.minSpeakers));
  }
  if (options.maxSpeakers != null) {
    form.append("max_speakers", String(options.maxSpeakers));
  }

  // Post-processing
  form.append("detect_paragraphs", String(options.detectParagraphs));
  form.append("paragraph_silence_threshold", String(options.paragraphSilenceThreshold));
  form.append("remove_fillers", String(options.removeFillers));

  if (options.minConfidence > 0) {
    form.append("min_confidence", String(options.minConfidence));
  }

  if (options.findReplace.length > 0) {
    form.append("find_replace", JSON.stringify(options.findReplace));
  }

  if (Object.keys(options.speakerLabels).length > 0) {
    form.append("speaker_labels", JSON.stringify(options.speakerLabels));
  }

  const res = await fetch(`${BASE}/v1/audio/transcriptions`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${BASE}/health`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

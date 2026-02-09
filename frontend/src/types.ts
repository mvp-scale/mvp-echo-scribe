export interface Segment {
  id: number;
  start: number;
  end: number;
  text: string;
  speaker?: string;
  originalSpeaker?: string;
  no_speech_prob?: number;
}

export interface Paragraph {
  speaker?: string;
  originalSpeaker?: string;
  start: number;
  end: number;
  text: string;
  segment_count: number;
}

export interface SpeakerStatistics {
  duration: number;
  percentage: number;
  word_count: number;
}

export interface Statistics {
  speakers: Record<string, SpeakerStatistics>;
  total_speakers: number;
}

export interface TranscriptionResponse {
  text: string;
  segments?: Segment[];
  language?: string;
  duration?: number;
  model?: string;
  paragraphs?: Paragraph[];
  statistics?: Statistics;
}

export interface TranscriptionOptions {
  diarize: boolean;
  numSpeakers?: number;
  minSpeakers?: number;
  maxSpeakers?: number;
  detectParagraphs: boolean;
  paragraphSilenceThreshold: number;
  removeFillers: boolean;
  minConfidence: number;
  findReplace: { find: string; replace: string }[];
  speakerLabels: Record<string, string>;
}

export const DEFAULT_OPTIONS: TranscriptionOptions = {
  diarize: true,
  detectParagraphs: true,
  paragraphSilenceThreshold: 0.8,
  removeFillers: false,
  minConfidence: 0.0,
  findReplace: [],
  speakerLabels: {},
};

export interface HealthResponse {
  status: string;
  model_loaded: boolean;
  model_id: string;
  cuda_available: boolean;
  gpu_name?: string;
  gpu_memory?: {
    allocated_mb: number;
    reserved_mb: number;
  };
  diarization_available: boolean;
}

export type ExportFormat = "srt" | "vtt" | "txt" | "json";

export type AppState = "idle" | "uploading" | "transcribing" | "done" | "error";

export type ViewMode = "line" | "para";

export type OutputTab = "transcript" | "json" | "srt" | "vtt" | "txt";

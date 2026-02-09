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

export interface DetectedEntity {
  text: string;
  label: string;
  category: string;
  count: number;
}

export interface DetectedTopic {
  text: string;
  count: number;
}

export interface TranscriptionResponse {
  text: string;
  segments?: Segment[];
  language?: string;
  duration?: number;
  model?: string;
  paragraphs?: Paragraph[];
  statistics?: Statistics;
  entities?: DetectedEntity[];
  topics?: DetectedTopic[];
}

export interface TextRule {
  name: string;
  find: string;
  replace: string;
  isRegex: boolean;
  flags: string;
  category: "filler" | "replace" | "pii";
  enabled: boolean;
}

export interface TextRuleset {
  version: number;
  name: string;
  rules: TextRule[];
}

export type TextRuleCategory = "all" | "filler" | "replace" | "pii";

export interface TranscriptionOptions {
  diarize: boolean;
  numSpeakers?: number;
  minSpeakers?: number;
  maxSpeakers?: number;
  detectParagraphs: boolean;
  paragraphSilenceThreshold: number;
  textRulesEnabled: boolean;
  textRules: TextRule[];
  textRuleCategory: TextRuleCategory;
  minConfidence: number;
  speakerLabels: Record<string, string>;
  detectEntities: boolean;
  detectTopics: boolean;
}

export const DEFAULT_OPTIONS: TranscriptionOptions = {
  diarize: true,
  detectParagraphs: true,
  paragraphSilenceThreshold: 0.8,
  textRulesEnabled: true,
  textRules: [],
  textRuleCategory: "all",
  minConfidence: 0.0,
  speakerLabels: {},
  detectEntities: false,
  detectTopics: false,
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

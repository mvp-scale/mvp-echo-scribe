import type { TextRule } from "../types";

export const DEFAULT_TEXT_RULES: TextRule[] = [
  // Filler word removal (case-insensitive, word boundary)
  { name: "Remove 'you know'", find: "you know", replace: "", isRegex: false, flags: "gi", category: "filler", enabled: true },
  { name: "Remove 'i mean'", find: "i mean", replace: "", isRegex: false, flags: "gi", category: "filler", enabled: true },
  { name: "Remove 'sort of'", find: "sort of", replace: "", isRegex: false, flags: "gi", category: "filler", enabled: true },
  { name: "Remove 'kind of'", find: "kind of", replace: "", isRegex: false, flags: "gi", category: "filler", enabled: true },
  { name: "Remove 'like'", find: "like", replace: "", isRegex: false, flags: "gi", category: "filler", enabled: true },
  { name: "Remove 'um'", find: "um", replace: "", isRegex: false, flags: "gi", category: "filler", enabled: true },
  { name: "Remove 'uh'", find: "uh", replace: "", isRegex: false, flags: "gi", category: "filler", enabled: true },

  // PII redaction (regex, case-insensitive)
  { name: "Redact SSN", find: "\\d{3}-\\d{2}-\\d{4}", replace: "[SSN]", isRegex: true, flags: "g", category: "pii", enabled: true },
  { name: "Redact credit card", find: "\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}", replace: "[CREDIT CARD]", isRegex: true, flags: "g", category: "pii", enabled: true },
  { name: "Redact email", find: "[\\w.+-]+@[\\w-]+\\.[\\w.-]+", replace: "[EMAIL]", isRegex: true, flags: "gi", category: "pii", enabled: true },
  { name: "Redact phone", find: "(?:\\+?1[- ]?)?\\(?\\d{3}\\)?[- ]?\\d{3}[- ]?\\d{4}", replace: "[PHONE]", isRegex: true, flags: "g", category: "pii", enabled: true },
  { name: "Redact IP address", find: "\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}", replace: "[IP]", isRegex: true, flags: "g", category: "pii", enabled: true },

  // Text replacements (case-insensitive, word boundary)
  { name: "gonna -> going to", find: "gonna", replace: "going to", isRegex: false, flags: "gi", category: "replace", enabled: true },
  { name: "wanna -> want to", find: "wanna", replace: "want to", isRegex: false, flags: "gi", category: "replace", enabled: true },
  { name: "gotta -> got to", find: "gotta", replace: "got to", isRegex: false, flags: "gi", category: "replace", enabled: true },
  { name: "lemme -> let me", find: "lemme", replace: "let me", isRegex: false, flags: "gi", category: "replace", enabled: true },
  { name: "dunno -> don't know", find: "dunno", replace: "don't know", isRegex: false, flags: "gi", category: "replace", enabled: true },
];

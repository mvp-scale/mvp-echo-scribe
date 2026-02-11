# PII Detection Pipeline — Research & Design

## Status: Research (Not Implemented)

The current Smart Redaction system uses client-side regex text rules (filler removal, find/replace, PII patterns). This document explores a more robust server-side PII detection pipeline combining spaCy NER with regex classification.

## Problem Statement

Spoken audio transcripts contain PII (Social Security numbers, credit cards, phone numbers, emails, IPs) but the numbers appear without formatting — no dashes, no dots. The transcriber outputs raw spoken content:

```
"My social security number is 123 01 2244"
"My credit card is 1234 1234 1234 1234"
"My phone number is 508 737 4849"
"My IP is 192 168 1 1"
```

Simple regex on raw transcript text is fragile because spacing varies based on how the speaker dictates the numbers. A two-stage pipeline (NER + regex) would be more reliable.

## Current Behavior (en_core_web_sm)

Testing with spaCy `en_core_web_sm` on spoken-style PII text:

| Spoken Input | spaCy Entity | Label | Usable? |
|---|---|---|---|
| `123 01 2244` (SSN, space-grouped) | `123 01 2244` | DATE | Yes — full span captured |
| `1 2 3 0 1 2 2 4 4` (SSN, digit-by-digit) | (nothing) | — | No — spaCy misses it |
| `1234 1234 1234 1234` (CC, grouped) | `1234 1234 1234 1234` | DATE | Yes — full span |
| `1234123412341234` (CC, no spaces) | `1234123412341234` | DATE | Yes — full span |
| `508 737 4849` (phone, 3-3-4) | `508`, `4849` | CARDINAL, DATE | Partial — fragmented into 2 entities |
| `5 0 8 7 3 7 4 8 4 9` (phone, digit-by-digit) | `5` | CARDINAL | No — only first digit |
| `192 168 1 1` (IP) | `192`, `168` | CARDINAL, CARDINAL | Partial — fragmented |
| `corey at test dot com` (email, spoken) | (nothing) | — | No — not numeric |
| `4 5 6 7 8 9 0 1 2` (SSN, single digits) | `4 5` as DATE, `0` as CARDINAL | — | Partial — fragmented |

### Key Observations

1. **Grouped numbers (3+ digits together)** — spaCy reliably captures the full span, often mislabeled as DATE
2. **Digit-by-digit speech** — spaCy fails almost completely
3. **Phone numbers (3-3-4 grouping)** — fragments into separate entities, middle group sometimes lost
4. **Entity labels are unreliable** — CARDINAL, DATE, and even ORG are used interchangeably for number spans
5. **The label doesn't matter** — what matters is that spaCy identified a span containing digits

## Proposed Pipeline: Three-Layer Detection

### Layer 1: spaCy NER — "Find the Number Blocks"

Upgrade from `en_core_web_sm` to `en_core_web_lg` (better span coverage, ~560 MB, cached on Docker volume).

Extract every entity whose text contains digits, regardless of label (DATE, CARDINAL, ORDINAL, etc.). spaCy's job is not to identify the PII type — it's to locate spans of numeric content in the text.

```python
numeric_spans = []
for ent in doc.ents:
    if any(c.isdigit() for c in ent.text):
        numeric_spans.append({
            "text": ent.text,
            "start": ent.start_char,
            "end": ent.end_char,
            "label": ent.label_,
        })
```

### Layer 2: Adjacency Grouping — "Stitch Fragments Together"

When spaCy fragments a number across multiple entities (e.g., phone: `508` + `4849`), group adjacent numeric entities into candidate spans.

Algorithm:
1. Sort numeric spans by start position
2. If two numeric spans are within N tokens of each other (N=3), merge into a single candidate
3. The merged candidate text includes everything between the spans
4. Continue merging until no adjacent pairs remain

```python
def merge_adjacent(spans, doc, max_gap_tokens=3):
    """Merge numeric entity spans that are close together."""
    if not spans:
        return []
    merged = [spans[0].copy()]
    for span in spans[1:]:
        prev = merged[-1]
        # Count non-digit tokens between end of prev and start of current
        gap_text = doc.text[prev["end"]:span["start"]]
        gap_tokens = len([t for t in gap_text.split() if not t.isdigit()])
        if gap_tokens <= max_gap_tokens:
            # Merge: extend previous span to cover current
            prev["end"] = span["end"]
            prev["text"] = doc.text[prev["start"]:span["end"]]
        else:
            merged.append(span.copy())
    return merged
```

Example: `508 737 4849`
- spaCy finds: `508` (CARDINAL), `4849` (DATE)
- `737` is between them (1 token gap)
- Merged candidate: `508 737 4849`

### Layer 3: Regex Classification — "What Kind of PII Is This?"

Run regex patterns on each merged candidate span. Strip spaces/dashes first, then match:

```python
import re

PII_PATTERNS = {
    "SSN": re.compile(r"^\d{9}$"),                    # 9 digits
    "CREDIT_CARD": re.compile(r"^\d{15,16}$"),         # 15-16 digits (Amex=15, Visa/MC=16)
    "PHONE_US": re.compile(r"^\d{10,11}$"),            # 10 digits (or 11 with country code)
    "IP_ADDRESS": re.compile(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$"),  # Keep dots for IP
}

def classify_pii(candidate_text):
    """Classify a numeric span as a PII type."""
    digits_only = re.sub(r"[\s\-\.]", "", candidate_text)

    for pii_type, pattern in PII_PATTERNS.items():
        if pii_type == "IP_ADDRESS":
            # IP needs dots preserved, check original with spaces→dots
            ip_text = re.sub(r"\s+", ".", candidate_text.strip())
            if pattern.match(ip_text):
                return pii_type
        elif pattern.match(digits_only):
            return pii_type

    # Fallback: any span with 5+ digits is flagged as NUMERIC_PII
    if len(digits_only) >= 5:
        return "NUMERIC_PII"

    return None
```

### Layer 4 (Enhancement): Context Boost

Check surrounding tokens for trigger words to increase confidence or disambiguate:

| Trigger Words | Suggests |
|---|---|
| social, security, ssn | SSN |
| card, credit, visa, mastercard, amex | CREDIT_CARD |
| phone, call, number, cell, mobile | PHONE_US |
| ip, address, network | IP_ADDRESS |
| email, mail, at, dot com | EMAIL |

Context doesn't change detection (regex does that) but it can resolve ambiguity — e.g., a 9-digit number near "social" is SSN, near "phone" with area code context is a partial phone number.

### Layer 5 (Fallback): Raw Text Regex Scan

For cases spaCy misses entirely (digit-by-digit speech), run a separate regex pass directly on the raw transcript text:

```python
# Detect sequences of single digits separated by spaces
DIGIT_SEQUENCE = re.compile(r"(?:\d\s+){4,}\d")  # 5+ single digits with spaces

for match in DIGIT_SEQUENCE.finditer(text):
    digits_only = re.sub(r"\s+", "", match.group())
    pii_type = classify_pii(digits_only)
    if pii_type:
        # Found PII that spaCy missed
        ...
```

This catches `1 2 3 0 1 2 2 4 4` → `123012244` → SSN.

## Model Recommendation

| Model | Pros | Cons | Recommendation |
|---|---|---|---|
| `en_core_web_sm` (current) | 12 MB, fast | Fragments numbers, poor span coverage | Not sufficient |
| `en_core_web_md` | 40 MB, word vectors | Marginal NER improvement over sm | Skip |
| `en_core_web_lg` | 560 MB, best statistical NER without transformer | Better span coverage, cached on volume | **Recommended** |
| `en_core_web_trf` | ~90% F1, transformer backbone | 400 MB, slower, CPU-heavy | Overkill for this use case |

`en_core_web_lg` is the right choice. It fits in the existing model cache volume, loads once at startup, and provides meaningfully better span detection for numeric content without the CPU overhead of a transformer model.

## Integration Points

### Where It Fits in the Current Architecture

```
[Upload] → [FFmpeg] → [Parakeet ASR] → [Diarization] → [PII Pipeline] → [Response]
                                                              │
                                                    ┌────────┤
                                                    │ Layer 1: spaCy NER (find numeric spans)
                                                    │ Layer 2: Adjacency grouping (merge fragments)
                                                    │ Layer 3: Regex classify (SSN/CC/Phone/IP)
                                                    │ Layer 4: Context boost (trigger words)
                                                    │ Layer 5: Raw text fallback (digit sequences)
                                                    └────────┤
                                                              │
                                                    Output: annotated PII spans with type + location
```

### Backend Changes Required

1. **New module**: `backend/pii_detection.py` — implements the 5-layer pipeline
2. **Model upgrade**: `en_core_web_sm` → `en_core_web_lg` in `entity_detection.py` and Dockerfile
3. **New request flag**: `redact_pii: bool = Form(False)` on the transcription endpoint
4. **Response annotation**: Add `pii_spans` to response with type, start, end, redacted text
5. **Redaction modes**: `mask` (replace with `[SSN]`), `hash` (replace with `***-**-1234`), `remove`

### Frontend Changes Required

1. **PII toggle** in settings panel (under Smart Redaction section)
2. **PII highlight** in transcript viewer — colored underlines by PII type
3. **PII summary** — count of detected PII items by type
4. **Redaction preview** — show before/after with redactions applied

### Dockerfile Changes

```dockerfile
# Replace sm with lg
RUN python3 -m spacy download en_core_web_lg
```

Model is ~560 MB, downloaded once and cached on the `scribe-models` Docker volume.

## What We Have Today (Quick Win)

The current Smart Redaction system works as client-side regex text rules:
- Predefined patterns for common PII formats (with dashes/dots)
- User can add custom find/replace rules
- Toggle on/off per category (filler, replace, pii)
- Applied client-side so raw data stays clean and toggling is instant

This is sufficient for demos and formatted text input. The pipeline described above is needed for reliable detection in spoken audio transcripts where formatting is absent.

## Estimated Scope

- Backend PII pipeline module: new file, ~200 lines
- Model upgrade: Dockerfile change + entity_detection.py model swap
- API integration: ~30 lines in api.py / use_cases/transcribe.py
- Frontend PII UI: settings toggle, highlight rendering, summary display
- Testing: need diverse audio samples with spoken PII in various formats

## Open Questions

1. **Luhn check for credit cards** — should we validate CC numbers with the Luhn algorithm to reduce false positives?
2. **International formats** — US-only for now (SSN, US phone), or include international patterns?
3. **Confidence scoring** — should each PII detection have a confidence score based on how many layers agreed?
4. **Redaction granularity** — per-segment or per-paragraph? Should redacted text show partial info (last 4 digits)?
5. **Performance** — `en_core_web_lg` loads ~2-3 seconds on first call. Acceptable if lazy-loaded after model startup?

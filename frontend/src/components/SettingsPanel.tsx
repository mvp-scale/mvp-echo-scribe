import { type TranscriptionOptions } from "../types";

interface Props {
  options: TranscriptionOptions;
  onChange: (options: TranscriptionOptions) => void;
  disabled?: boolean;
  detectedSpeakers?: string[];
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="relative inline-flex w-9 h-5 shrink-0 cursor-pointer">
      <input
        type="checkbox"
        className="sr-only peer"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span
        className="absolute inset-0 rounded-full border transition-all
          bg-surface-3 border-border peer-checked:bg-mvp-blue-dim peer-checked:border-mvp-blue
          peer-disabled:opacity-30 peer-disabled:cursor-not-allowed"
      />
      <span
        className="absolute top-[3px] left-[3px] w-3.5 h-3.5 rounded-full transition-all
          bg-gray-500 peer-checked:translate-x-4 peer-checked:bg-mvp-blue"
      />
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
  min = 1,
  max = 20,
}: {
  value?: number;
  onChange: (v?: number) => void;
  placeholder: string;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      className="w-14 px-1.5 py-0.5 bg-surface-3 border border-border rounded text-xs
        text-gray-200 placeholder-gray-600 focus:border-mvp-blue focus:outline-none"
      placeholder={placeholder}
      min={min}
      max={max}
      value={value ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? undefined : parseInt(v, 10));
      }}
    />
  );
}

export default function SettingsPanel({ options, onChange, disabled, detectedSpeakers = [] }: Props) {
  const set = <K extends keyof TranscriptionOptions>(
    key: K,
    value: TranscriptionOptions[K]
  ) => {
    onChange({ ...options, [key]: value });
  };

  const addFindReplace = () => {
    set("findReplace", [...options.findReplace, { find: "", replace: "" }]);
  };

  const removeFindReplace = (index: number) => {
    set(
      "findReplace",
      options.findReplace.filter((_, i) => i !== index)
    );
  };

  const updateFindReplace = (
    index: number,
    field: "find" | "replace",
    value: string
  ) => {
    const updated = [...options.findReplace];
    updated[index] = { ...updated[index], [field]: value };
    set("findReplace", updated);
  };

  return (
    <div className="p-5 space-y-6 text-sm">
      {/* Transcription */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3 pb-1.5 border-b border-border">
          Transcription
        </div>

        {/* Diarization */}
        <div className="py-2.5">
          <div className="flex items-start gap-2.5">
            <Toggle
              checked={options.diarize}
              onChange={(v) => set("diarize", v)}
              disabled={disabled}
            />
            <div className="flex-1">
              <div className="text-[13px] font-semibold">Diarization</div>
              <div className="text-[10px] font-mono text-mvp-blue-light mt-0.5">
                diarize={String(options.diarize)}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                Identify and label speakers.
              </div>
            </div>
          </div>
          {options.diarize && (
            <div className="mt-2 pl-[46px] space-y-1.5">
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] text-gray-400 whitespace-nowrap">
                  Min speakers:
                </label>
                <NumberInput
                  value={options.minSpeakers}
                  onChange={(v) => set("minSpeakers", v)}
                  placeholder="Auto"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] text-gray-400 whitespace-nowrap">
                  Max speakers:
                </label>
                <NumberInput
                  value={options.maxSpeakers}
                  onChange={(v) => set("maxSpeakers", v)}
                  placeholder="Auto"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] text-gray-400 whitespace-nowrap">
                  Exact count:
                </label>
                <NumberInput
                  value={options.numSpeakers}
                  onChange={(v) => set("numSpeakers", v)}
                  placeholder="Auto"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Post-Processing */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3 pb-1.5 border-b border-border">
          Post-Processing
        </div>

        {/* Detect Paragraphs */}
        <div className="py-2.5">
          <div className="flex items-start gap-2.5">
            <Toggle
              checked={options.detectParagraphs}
              onChange={(v) => set("detectParagraphs", v)}
              disabled={disabled}
            />
            <div className="flex-1">
              <div className="text-[13px] font-semibold">Detect Paragraphs</div>
              <div className="text-[10px] font-mono text-mvp-blue-light mt-0.5">
                detect_paragraphs={String(options.detectParagraphs)}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                Group segments by speaker turn.
              </div>
            </div>
          </div>
          {options.detectParagraphs && (
            <div className="mt-2 pl-[46px]">
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] text-gray-400 whitespace-nowrap">
                  Silence gap:
                </label>
                <input
                  type="range"
                  min="0.2"
                  max="5"
                  step="0.1"
                  value={options.paragraphSilenceThreshold}
                  onChange={(e) =>
                    set("paragraphSilenceThreshold", parseFloat(e.target.value))
                  }
                  className="flex-1 accent-mvp-blue"
                />
                <span className="text-[10px] font-mono text-gray-200 min-w-[32px] text-right">
                  {options.paragraphSilenceThreshold.toFixed(1)}s
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Remove Fillers */}
        <div className="py-2.5">
          <div className="flex items-start gap-2.5">
            <Toggle
              checked={options.removeFillers}
              onChange={(v) => set("removeFillers", v)}
              disabled={disabled}
            />
            <div className="flex-1">
              <div className="text-[13px] font-semibold">Remove Filler Words</div>
              <div className="text-[10px] font-mono text-mvp-blue-light mt-0.5">
                remove_fillers={String(options.removeFillers)}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                Strip "uh", "um", "you know".
              </div>
            </div>
          </div>
        </div>

        {/* Confidence Filter */}
        <div className="py-2.5">
          <div className="flex items-start gap-2.5">
            <Toggle
              checked={options.minConfidence > 0}
              onChange={(v) => set("minConfidence", v ? 0.5 : 0)}
              disabled={disabled}
            />
            <div className="flex-1">
              <div className="text-[13px] font-semibold">Confidence Filter</div>
              <div className="text-[10px] font-mono text-mvp-blue-light mt-0.5">
                min_confidence={options.minConfidence.toFixed(2)}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                Filter low-confidence segments.
              </div>
            </div>
          </div>
          {options.minConfidence > 0 && (
            <div className="mt-2 pl-[46px]">
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] text-gray-400 whitespace-nowrap">
                  Threshold:
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={options.minConfidence}
                  onChange={(e) =>
                    set("minConfidence", parseFloat(e.target.value))
                  }
                  className="flex-1 accent-mvp-blue"
                />
                <span className="text-[10px] font-mono text-gray-200 min-w-[32px] text-right">
                  {options.minConfidence.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Find & Replace */}
        <div className="py-2.5">
          <div className="flex items-start gap-2.5">
            <Toggle
              checked={options.findReplace.length > 0}
              onChange={(v) => {
                if (v) addFindReplace();
                else set("findReplace", []);
              }}
              disabled={disabled}
            />
            <div className="flex-1">
              <div className="text-[13px] font-semibold">Find & Replace</div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                Custom text replacements.
              </div>
            </div>
          </div>
          {options.findReplace.length > 0 && (
            <div className="mt-2 pl-[46px] space-y-1.5">
              {options.findReplace.map((rule, i) => (
                <div key={i} className="flex items-center gap-1">
                  <input
                    type="text"
                    className="flex-1 px-1.5 py-0.5 bg-surface-3 border border-border rounded text-[11px]
                      text-gray-200 placeholder-gray-600 focus:border-mvp-blue focus:outline-none"
                    placeholder="Find..."
                    value={rule.find}
                    onChange={(e) =>
                      updateFindReplace(i, "find", e.target.value)
                    }
                  />
                  <span className="text-gray-500 text-[11px]">&rarr;</span>
                  <input
                    type="text"
                    className="flex-1 px-1.5 py-0.5 bg-surface-3 border border-border rounded text-[11px]
                      text-gray-200 placeholder-gray-600 focus:border-mvp-blue focus:outline-none"
                    placeholder="Replace..."
                    value={rule.replace}
                    onChange={(e) =>
                      updateFindReplace(i, "replace", e.target.value)
                    }
                  />
                  <button
                    className="text-gray-500 hover:text-red-400 text-sm px-1"
                    onClick={() => removeFindReplace(i)}
                  >
                    &times;
                  </button>
                </div>
              ))}
              <button
                className="w-full py-0.5 text-[11px] text-gray-500 border border-dashed border-border
                  rounded hover:border-mvp-blue hover:text-mvp-blue-light"
                onClick={addFindReplace}
              >
                + Add rule
              </button>
            </div>
          )}
        </div>

        {/* Custom Speaker Labels - auto-enabled when speakers detected */}
        {detectedSpeakers.length > 1 && (
          <div className="py-2.5">
            <div className="text-[13px] font-semibold">
              Speaker Labels
              <span className="text-[10px] font-normal text-gray-500 ml-1">
                ({detectedSpeakers.length} detected)
              </span>
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5 mb-2">
              Rename speakers in output and exports.
            </div>
            <div className="space-y-1.5">
              {detectedSpeakers.map((spk, i) => {
                const color = `var(--speaker-${i % 8})`;
                return (
                  <div key={spk} className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: color }}
                    />
                    <span className="text-[10px] text-gray-500 whitespace-nowrap w-[18px]">
                      {i + 1}
                    </span>
                    <input
                      type="text"
                      className="flex-1 px-1.5 py-0.5 bg-surface-3 border border-border rounded text-[11px]
                        text-gray-200 placeholder-gray-600 focus:border-mvp-blue focus:outline-none"
                      placeholder={`Speaker ${i + 1}`}
                      value={options.speakerLabels[spk] ?? ""}
                      onChange={(e) => {
                        const labels = { ...options.speakerLabels };
                        if (e.target.value) {
                          labels[spk] = e.target.value;
                        } else {
                          delete labels[spk];
                        }
                        set("speakerLabels", labels);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Audio Intelligence - future features */}
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3 pb-1.5 border-b border-border">
          Audio Intelligence
        </div>
        {[
          { name: "Entity Detection", phase: "Phase 2" },
          { name: "Sentiment", phase: "Phase 2" },
          { name: "PII Redaction", phase: "Phase 2" },
          { name: "Summarization", phase: "Phase 3" },
          { name: "Topic Detection", phase: "Phase 3" },
        ].map((feat) => (
          <div key={feat.name} className="py-2">
            <div className="flex items-start gap-2.5">
              <Toggle checked={false} onChange={() => {}} disabled />
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-gray-400">
                  {feat.name}{" "}
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 font-semibold ml-1">
                    {feat.phase}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

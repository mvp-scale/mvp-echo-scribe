import type { TranscriptionOptions } from "../types";

interface Props {
  options: TranscriptionOptions;
}

function buildCurlFlags(options: TranscriptionOptions): string[] {
  const flags: string[] = [];
  flags.push('-F "file=@audio.mp3"');
  if (options.diarize) flags.push('-F "diarize=true"');
  if (options.numSpeakers != null)
    flags.push(`-F "num_speakers=${options.numSpeakers}"`);
  if (options.minSpeakers != null)
    flags.push(`-F "min_speakers=${options.minSpeakers}"`);
  if (options.maxSpeakers != null)
    flags.push(`-F "max_speakers=${options.maxSpeakers}"`);
  if (options.detectParagraphs) flags.push('-F "detect_paragraphs=true"');
  if (options.minConfidence > 0)
    flags.push(`-F "min_confidence=${options.minConfidence}"`);
  if (options.textRulesEnabled) {
    const activeRules = options.textRules.filter((r) =>
      r.enabled && (options.textRuleCategory === "all" || r.category === options.textRuleCategory)
    );
    if (activeRules.length > 0) {
      const json = JSON.stringify(activeRules);
      flags.push(`-F 'text_rules=${json}'`);
    }
  }
  if (options.detectEntities) flags.push('-F "detect_entities=true"');
  if (options.detectTopics) flags.push('-F "detect_topics=true"');
  flags.push('-F "response_format=verbose_json"');
  return flags;
}

export default function CodeSamplePanel({ options }: Props) {
  const url = `${window.location.origin}/v1/audio/transcriptions`;
  const flags = buildCurlFlags(options);

  const curlCmd = [
    "curl -X POST \\",
    ...flags.map((f) => `  ${f} \\`),
    `  ${url}`,
  ].join("\n");

  const pyData = flags
    .filter((f) => f.startsWith('-F'))
    .map((f) => {
      const match = f.match(/"(.+?)=(.+?)"/);
      if (!match) return "";
      return `    "${match[1]}": "${match[2]}",`;
    })
    .filter(Boolean)
    .join("\n");

  const pythonCode = `import requests

url = "${url}"
files = {"file": open("audio.mp3", "rb")}
data = {
${pyData}
}

response = requests.post(url, files=files, data=data)
result = response.json()

# Print paragraphs with speaker labels
for p in result.get("paragraphs", []):
    speaker = p.get("speaker", "Unknown")
    print(f"[{p['start']:.1f}s - {p['end']:.1f}s] {speaker}:")
    print(f"  {p['text']}\\n")`;

  return (
    <div className="p-5 space-y-5">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
          cURL Request
        </div>
        <div className="relative">
          <pre className="p-4 bg-surface-2 border border-border rounded-lg text-xs font-mono leading-relaxed text-gray-400 whitespace-pre-wrap overflow-x-auto">
            <span className="text-green-400">curl</span>{" "}
            <span className="text-blue-400">-X POST</span> \{"\n"}
            {flags.map((f, i) => (
              <span key={i}>
                {"  "}
                <span className="text-blue-400">
                  {f.split(" ")[0]}
                </span>{" "}
                <span className="text-orange-300">
                  {f.split(" ").slice(1).join(" ")}
                </span>
                {" \\\n"}
              </span>
            ))}
            {"  "}
            <span className="text-mvp-blue-light">{url}</span>
          </pre>
          <button
            className="absolute top-2 right-2 px-2 py-0.5 text-[11px] bg-surface-3 border border-border rounded text-gray-500 hover:text-white"
            onClick={() => navigator.clipboard.writeText(curlCmd)}
          >
            Copy
          </button>
        </div>
      </div>

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
          Python
        </div>
        <div className="relative">
          <pre className="p-4 bg-surface-2 border border-border rounded-lg text-xs font-mono leading-relaxed text-gray-400 whitespace-pre-wrap overflow-x-auto">
            {pythonCode}
          </pre>
          <button
            className="absolute top-2 right-2 px-2 py-0.5 text-[11px] bg-surface-3 border border-border rounded text-gray-500 hover:text-white"
            onClick={() => navigator.clipboard.writeText(pythonCode)}
          >
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}

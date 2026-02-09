/**
 * Renders text with visual highlighting for:
 * 1. Redaction markers like [SSN], [CREDIT CARD], [EMAIL], [PHONE], [IP], etc.
 * 2. Search query matches
 *
 * Redaction markers are detected by the pattern [UPPERCASE TEXT].
 * They render as bright colored text (no pill/badge).
 */

const REDACTION_PATTERN = /(\[[A-Z][A-Z0-9 ]*\])/g;

export function renderText(text: string, searchQuery?: string): JSX.Element {
  // Step 1: Split on redaction markers
  const redactionParts = text.split(REDACTION_PATTERN);

  if (!searchQuery) {
    return (
      <>
        {redactionParts.map((part, i) =>
          REDACTION_PATTERN.test(part) ? (
            <span key={i} className="text-rose-400 font-semibold">
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  }

  // Step 2: Within each part, also split on search query
  const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const searchRegex = new RegExp(`(${escaped})`, "gi");

  return (
    <>
      {redactionParts.map((part, i) => {
        if (REDACTION_PATTERN.test(part)) {
          return (
            <span key={i} className="text-rose-400 font-semibold">
              {part}
            </span>
          );
        }
        // Apply search highlighting within non-redacted text
        const searchParts = part.split(searchRegex);
        return (
          <span key={i}>
            {searchParts.map((sp, j) =>
              searchRegex.test(sp) ? (
                <mark key={j} className="bg-yellow-500/25 text-gray-200 rounded px-0.5">
                  {sp}
                </mark>
              ) : (
                <span key={j}>{sp}</span>
              )
            )}
          </span>
        );
      })}
    </>
  );
}

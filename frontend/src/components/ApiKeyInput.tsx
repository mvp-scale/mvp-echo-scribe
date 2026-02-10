import { useState, useRef, useEffect } from "react";
import { getStoredApiKey, setStoredApiKey } from "../api";

export default function ApiKeyInput() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(getStoredApiKey);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const hasKey = !!getStoredApiKey();

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function save() {
    setStoredApiKey(key.trim());
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setOpen(false);
    }, 800);
  }

  function clear() {
    setKey("");
    setStoredApiKey("");
    setSaved(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
          hasKey
            ? "text-green-400 hover:bg-green-500/10"
            : "text-gray-500 hover:bg-surface-3"
        }`}
        title={hasKey ? "API key configured" : "No API key set"}
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          {hasKey ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
            />
          )}
        </svg>
        <span className="hidden sm:inline">
          {hasKey ? "Key set" : "API Key"}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-surface-2 border border-border rounded-lg shadow-xl p-3 z-50">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
            API Key
          </label>
          <div className="flex gap-1.5">
            <input
              ref={inputRef}
              type="password"
              className="flex-1 px-2 py-1.5 bg-surface-3 border border-border rounded text-xs
                text-gray-200 placeholder-gray-600 hover:border-mvp-blue
                focus:border-mvp-blue focus:outline-none font-mono"
              placeholder="sk-..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
            <button
              onClick={save}
              className="px-2.5 py-1.5 bg-mvp-blue/20 text-mvp-blue-light border border-mvp-blue
                rounded text-xs font-medium hover:bg-mvp-blue/30 transition-colors"
            >
              {saved ? "Saved" : "Save"}
            </button>
          </div>
          {hasKey && (
            <button
              onClick={clear}
              className="mt-1.5 text-[10px] text-gray-500 hover:text-red-400 transition-colors"
            >
              Clear key
            </button>
          )}
          <p className="mt-2 text-[10px] text-gray-600 leading-relaxed">
            Required for external access. LAN connections don't need a key.
          </p>
        </div>
      )}
    </div>
  );
}

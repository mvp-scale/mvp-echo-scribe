import type { ReactNode } from "react";
import HealthIndicator from "./HealthIndicator";
import ApiKeyInput from "./ApiKeyInput";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-surface-0">
      <header className="flex items-center justify-between px-8 py-3.5 border-b border-border">
        <h1 className="text-lg font-semibold tracking-tight text-white">
          MVP-Echo Scribe
        </h1>
        <div className="flex items-center gap-3">
          <ApiKeyInput />
          <HealthIndicator />
        </div>
      </header>
      <main className="flex-1 flex flex-col min-h-0">{children}</main>
    </div>
  );
}

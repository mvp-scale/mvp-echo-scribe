import type { ReactNode } from "react";
import HealthIndicator from "./HealthIndicator";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-surface-0">
      <header className="flex items-center justify-between px-8 py-3.5 border-b border-border">
        <h1 className="text-lg font-semibold tracking-tight text-white">
          MVP-Echo Studio
        </h1>
        <HealthIndicator />
      </header>
      <main className="flex-1 flex flex-col min-h-0">{children}</main>
    </div>
  );
}

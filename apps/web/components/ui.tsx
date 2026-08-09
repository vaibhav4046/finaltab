"use client";

import type { ReactNode } from "react";

export function Panel({
  title,
  step,
  children,
  accent = false,
}: {
  title: string;
  step: string;
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <section
      className={`flex min-h-0 flex-col rounded-lg border bg-panel ${
        accent ? "border-lime/30" : "border-edge"
      }`}
    >
      <header className="flex items-baseline justify-between border-b border-edge-soft px-4 py-3">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-fog">{title}</h2>
        <span className="font-mono text-[10px] text-fog-dim">{step}</span>
      </header>
      <div className="lab-scroll min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </section>
  );
}

export function Badge({
  tone,
  children,
}: {
  tone: "lime" | "coral" | "amber" | "fog";
  children: ReactNode;
}) {
  const tones = {
    lime: "border-lime/40 bg-lime/10 text-lime",
    coral: "border-coral/40 bg-coral/10 text-coral",
    amber: "border-amber/40 bg-amber/10 text-amber",
    fog: "border-edge bg-panel-2 text-fog",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Button({
  onClick,
  disabled,
  variant = "primary",
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  children: ReactNode;
}) {
  const variants = {
    primary:
      "bg-lime text-night hover:bg-lime-dim disabled:bg-panel-2 disabled:text-fog-dim",
    ghost:
      "border border-edge bg-transparent text-paper hover:border-fog disabled:text-fog-dim disabled:hover:border-edge",
    danger: "bg-coral/15 text-coral border border-coral/40 hover:bg-coral/25 disabled:opacity-40",
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider transition-colors disabled:cursor-not-allowed ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

export function Mono({ children, dim = false }: { children: ReactNode; dim?: boolean }) {
  return <span className={`font-mono text-xs ${dim ? "text-fog-dim" : "text-fog"}`}>{children}</span>;
}

export function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border border-fog border-t-transparent align-middle"
      aria-label="loading"
    />
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p className="mt-2 rounded-md border border-coral/30 bg-coral/5 px-3 py-2 font-mono text-[11px] leading-relaxed text-coral">
      {message}
    </p>
  );
}

export function BlockedNote({ message }: { message: string }) {
  return (
    <div className="mt-2 rounded-md border border-amber/30 bg-amber/5 px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-wider text-amber">Blocked — honest state</p>
      <p className="mt-1 font-mono text-[11px] leading-relaxed text-paper-dim">{message}</p>
    </div>
  );
}

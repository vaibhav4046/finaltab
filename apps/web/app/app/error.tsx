"use client";

import Link from "next/link";

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="workspace-page grid min-h-[70vh] place-items-center py-10">
      <section className="surface-shadow w-full max-w-2xl rounded-2xl border border-danger/30 bg-surface-1 p-6 sm:p-8" aria-labelledby="workspace-error-title">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-danger">Workspace interrupted</p>
        <h1 id="workspace-error-title" className="mt-3 text-3xl font-semibold tracking-tight text-txt">The workspace could not verify this view.</h1>
        <p className="mt-3 text-sm leading-6 text-muted">No draft, approval, execution, or proof state was accepted from the failed request.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="touch-target rounded-xl bg-signal px-5 text-sm font-semibold text-ink">Try again</button>
          <Link href="/app" className="touch-target inline-flex items-center rounded-xl border border-quiet px-5 text-sm font-semibold text-muted">Shared tab history</Link>
        </div>
      </section>
    </div>
  );
}

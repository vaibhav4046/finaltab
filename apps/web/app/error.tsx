"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="app-shell grid min-h-dvh place-items-center bg-canvas px-4 py-12 text-txt">
      <section className="surface-shadow w-full max-w-2xl rounded-2xl border border-danger/30 bg-surface-1 p-6 sm:p-9" aria-labelledby="route-error-title">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-danger">Route interrupted</p>
        <h1 id="route-error-title" className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-paper">This page could not finish loading.</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-muted">No successful settlement or proof state is shown when the route fails. Retry the request or return to a known surface.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="touch-target rounded-xl bg-signal px-5 text-sm font-semibold text-ink">Try again</button>
          <Link href="/" className="touch-target inline-flex items-center rounded-xl border border-quiet px-5 text-sm font-semibold text-muted">Return home</Link>
        </div>
      </section>
    </main>
  );
}

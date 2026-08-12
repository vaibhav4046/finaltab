import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app-shell grid min-h-dvh place-items-center bg-canvas px-4 py-12 text-txt">
      <section className="surface-shadow w-full max-w-2xl rounded-2xl border border-quiet bg-surface-1 p-6 sm:p-9" aria-labelledby="not-found-title">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-info">404 / Route not found</p>
        <h1 id="not-found-title" className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-paper sm:text-5xl">This rail ends here.</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-muted">The requested FINALTab page does not exist. No settlement, approval, or proof state was inferred.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/" className="touch-target inline-flex items-center rounded-xl bg-signal px-5 text-sm font-semibold text-ink">Return home</Link>
          <Link href="/app" className="touch-target inline-flex items-center rounded-xl border border-info/40 px-5 text-sm font-semibold text-info">Open workspace</Link>
        </div>
      </section>
    </main>
  );
}

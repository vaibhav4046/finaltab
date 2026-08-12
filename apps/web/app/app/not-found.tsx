import Link from "next/link";

export default function WorkspaceNotFound() {
  return (
    <div className="workspace-page grid min-h-[70vh] place-items-center py-10">
      <section className="surface-shadow w-full max-w-2xl rounded-2xl border border-quiet bg-surface-1 p-6 sm:p-8" aria-labelledby="workspace-not-found-title">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-info">Workspace route not found</p>
        <h1 id="workspace-not-found-title" className="mt-3 text-3xl font-semibold tracking-tight text-txt">This workspace surface does not exist.</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Return to shared tab history to open a durable record you can access.</p>
        <Link href="/app" className="touch-target mt-5 inline-flex items-center rounded-xl bg-signal px-5 text-sm font-semibold text-ink">Open shared tabs</Link>
      </section>
    </div>
  );
}

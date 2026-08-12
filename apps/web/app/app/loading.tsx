export default function WorkspaceLoading() {
  return (
    <div className="workspace-page py-10" aria-live="polite" aria-busy="true">
      <section className="rounded-2xl border border-quiet-soft bg-surface-1 p-6 sm:p-8">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-info">Workspace / Loading</p>
        <div className="mt-5 h-px overflow-hidden bg-quiet-soft" aria-hidden="true">
          <span className="route-progress block h-full w-2/3 bg-gradient-to-r from-info to-signal" />
        </div>
        <p className="mt-4 text-sm text-muted" role="status">Verifying the requested workspace state…</p>
      </section>
    </div>
  );
}

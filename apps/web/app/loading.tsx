export default function Loading() {
  return (
    <main className="app-shell grid min-h-dvh place-items-center bg-canvas px-4 text-txt" aria-live="polite" aria-busy="true">
      <div className="w-full max-w-lg">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-signal">FINALTab / Loading</p>
        <div className="mt-4 h-px overflow-hidden bg-quiet-soft" aria-hidden="true">
          <span className="route-progress block h-full w-2/3 bg-gradient-to-r from-info to-signal" />
        </div>
        <p className="mt-4 text-sm text-muted" role="status">Opening the requested surface…</p>
      </div>
    </main>
  );
}

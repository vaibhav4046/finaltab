import { AuthReturnProofGraphic } from "@/components/AuthReturnProofGraphic";

export default function AuthCompleteLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 md:px-6">
      <section className="overflow-hidden rounded-2xl border border-edge bg-panel" aria-busy="true" aria-live="polite">
        <div className="grid items-center gap-6 bg-[radial-gradient(circle_at_85%_20%,rgba(20,92,255,0.16),transparent_42%)] p-6 md:grid-cols-[1fr_320px] md:p-9">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">FINALTab / Secure return</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-paper md:text-4xl">Verifying your email return.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fog">
              Checking the signed Supabase session before any account or Privy identity is shown.
            </p>
            <div className="mt-6 h-1.5 max-w-md overflow-hidden rounded-full bg-edge">
              <span className="block h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-signal to-blue-400" />
            </div>
          </div>
          <AuthReturnProofGraphic state="pending" />
        </div>
      </section>
    </div>
  );
}

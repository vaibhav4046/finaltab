"use client";

import Link from "next/link";
import { AuthReturnProofGraphic } from "@/components/AuthReturnProofGraphic";

export default function AuthCompleteError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 md:px-6">
      <section className="overflow-hidden rounded-2xl border border-danger/30 bg-panel" role="alert">
        <div className="grid items-center gap-6 bg-[radial-gradient(circle_at_85%_20%,rgba(255,107,107,0.1),transparent_42%)] p-6 md:grid-cols-[1fr_320px] md:p-9">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-danger">FINALTab / Return blocked</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-paper md:text-4xl">We could not verify this return.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fog">
              No account or wallet identity was assumed. Retry the session check, or start a fresh secure sign-in from the account page.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={reset} className="min-h-11 rounded-lg bg-signal px-5 font-mono text-xs font-semibold uppercase tracking-wider text-ink">
                Retry verification
              </button>
              <Link href="/auth/sign-in" className="inline-flex min-h-11 items-center rounded-lg border border-edge px-5 text-sm text-paper">
                Restart sign-in
              </Link>
            </div>
          </div>
          <AuthReturnProofGraphic state="error" />
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthReturnProofGraphic } from "@/components/AuthReturnProofGraphic";
import { PrivySessionPanel } from "@/components/PrivySessionPanel";
import { safeNextPath } from "@/lib/auth/navigation";
import { privyServerConfig } from "@/lib/privy/server";
import { authenticatedUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Account verified - FINALTab",
};

export default async function AuthCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: requestedNext } = await searchParams;
  const next = safeNextPath(requestedNext);
  const { configured, user } = await authenticatedUser();
  if (!configured) {
    redirect(`/auth?error=cloud-not-configured&next=${encodeURIComponent(next)}`);
  }
  if (!user) {
    redirect(`/auth?error=session-required&next=${encodeURIComponent(next)}`);
  }
  const privyConfigured = Boolean(privyServerConfig());

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 md:px-6">
      <section className="overflow-hidden rounded-2xl border border-edge bg-panel">
        <div className="grid items-center gap-6 border-b border-edge bg-[radial-gradient(circle_at_85%_20%,rgba(20,92,255,0.16),transparent_42%)] p-6 md:grid-cols-[1fr_320px] md:p-9">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-signal/30 bg-signal/5 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-signal">
              <span className="h-1.5 w-1.5 rounded-full bg-signal" />
              Supabase session verified
            </div>
            <p className="mt-5 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-signal">FINALTab / Secure return</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-paper md:text-4xl">Identity verified. Secure session ready.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fog">
              Supabase established the durable account for <span className="text-paper">{user.email ?? "this user"}</span>.
              {privyConfigured
                ? " The optional Privy bridge must prove that exact subject link before showing a provisioned wallet identity."
                : " Database access remains bound to that signed Supabase subject."}
              {" "}Current V2 settlement signatures still come from external wallets.
            </p>
          </div>
          <AuthReturnProofGraphic state="verified" />
        </div>

        <div className="p-6 md:p-9">
          {privyConfigured ? <PrivySessionPanel /> : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={next}
              className="inline-flex min-h-11 items-center rounded-lg bg-signal px-5 font-mono text-xs font-semibold uppercase tracking-wider text-ink"
            >
              Continue to FINALTab
            </Link>
            <Link href="/auth" className="inline-flex min-h-11 items-center px-2 text-sm text-fog hover:text-paper">
              Review account security
            </Link>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-fog-dim">
            Tabs, membership and approvals remain authorized by Supabase Row Level Security. Optional wallet providers never replace it.
          </p>
        </div>
      </section>
    </div>
  );
}

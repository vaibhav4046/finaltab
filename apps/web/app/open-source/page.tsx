import { PublicHeader } from "@/components/PublicHeader";

export const metadata = {
  title: "FINALTab — open source",
  description: "The FINALTab V2 monorepo: reproducible checks and the KeeperHub CLI contribution.",
};

const PACKAGES: Array<{ name: string; what: string; checks: string }> = [
  {
    name: "packages/engine",
    what: "Deterministic money core — integer minor units, largest-remainder splits, debt netting, canonical V2 plan hashing, and EIP-3009 typed data.",
    checks: "60",
  },
  {
    name: "packages/vision",
    what: "Groq receipt extraction + natural-language allocation. Model output is always a proposal; the engine reconciles.",
    checks: "32 passing · 1 live API skipped",
  },
  {
    name: "packages/keeperhub",
    what: "Fail-closed KeeperHub client — simulate, execute, status. Refuses to report success it cannot prove.",
    checks: "35",
  },
  {
    name: "packages/keeperhub-flight-recorder",
    what: "kh-proof CLI: replays the verification chain for any executionId — terminal state, onchain receipt, verified flag.",
    checks: "7",
  },
  {
    name: "apps/web",
    what: "Next.js product, authenticated MCP boundary, hybrid voice safety, collaboration policies, KeeperHub discovery, V2 settlement preparation, and independent proof checks.",
    checks: "141",
  },
  {
    name: "contracts",
    what: "FinalTabBatchSettlementV2 — plan-bound pulls and payouts, consent, replay resistance, atomicity, expiry, and exact conservation. V1 remains only as regression history.",
    checks: "27",
  },
];

export default function OpenSourcePage() {
  return (
    <div className="min-h-screen bg-canvas text-txt">
      <PublicHeader active="open-source" />

      <main className="atmosphere mx-auto max-w-5xl px-4 pb-24 pt-14 sm:px-6">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-signal">Open source</p>
        <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-paper sm:text-4xl">
          302 passing checks. Four browser journeys across desktop and mobile. One reproducible V2 path.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
          FINALTab is a pnpm monorepo. The money math is deterministic and tested; the AI layer only
          proposes; the KeeperHub layer is fail-closed. Safety-critical behavior is covered by unit,
          integration, contract, and Playwright checks you can run yourself.
        </p>

        <section className="mt-14" aria-labelledby="packages-heading">
          <h2 id="packages-heading" className="font-mono text-sm font-semibold uppercase tracking-wider text-paper">
            01 · Packages
          </h2>
          <div className="mt-4 space-y-2">
            {PACKAGES.map((p) => (
              <div key={p.name} className="rounded-md border border-quiet bg-surface-1 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <code className="font-mono text-xs font-semibold text-paper">{p.name}</code>
                  <span className="font-mono text-[11px] text-signal">{p.checks}</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{p.what}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14" aria-labelledby="upstream-heading">
          <h2 id="upstream-heading" className="font-mono text-sm font-semibold uppercase tracking-wider text-paper">
            02 · Upstream contribution
          </h2>
          <div className="mt-4 rounded-lg border border-quiet bg-surface-1 p-5">
            <p className="text-sm leading-relaxed text-muted">
              We contributed an onboarding improvement to the KeeperHub CLI:{" "}
              <a
                href="https://github.com/KeeperHub/cli/pull/95"
                className="text-signal underline decoration-signal/40 underline-offset-2 hover:decoration-signal"
                target="_blank"
                rel="noopener noreferrer"
              >
                KeeperHub/cli PR #95
              </a>
              . Status: <span className="font-mono text-xs text-warn">open</span> — it is a submitted
              pull request, not a merged one, and we label it exactly that.
            </p>
          </div>
        </section>

        <section className="mt-14" aria-labelledby="repo-heading">
          <h2 id="repo-heading" className="font-mono text-sm font-semibold uppercase tracking-wider text-paper">
            03 · Repository
          </h2>
          <div className="mt-4 rounded-lg border border-quiet bg-surface-1 p-5">
            <p className="break-all font-mono text-sm text-paper-dim">
              <a
                href="https://github.com/vaibhav4046/finaltab"
                className="text-signal underline decoration-signal/40 underline-offset-2 hover:decoration-signal"
                target="_blank"
                rel="noopener noreferrer"
              >
                github.com/vaibhav4046/finaltab
              </a>
            </p>
            <p id="repository-commands-label" className="sr-only">Repository setup and test commands</p>
            <pre
              className="lab-scroll mt-4 overflow-x-auto rounded-md border border-quiet-soft bg-canvas p-4 font-mono text-xs leading-relaxed text-paper-dim"
              role="region"
              aria-labelledby="repository-commands-label"
              tabIndex={0}
            >
{`git clone https://github.com/vaibhav4046/finaltab
cd finaltab
pnpm install --frozen-lockfile
pnpm test       # 302 passing, 1 env-gated live-API check skipped
pnpm test:e2e   # production build + 4 journeys on desktop and mobile`}
            </pre>
          </div>
        </section>
      </main>
    </div>
  );
}

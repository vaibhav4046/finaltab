import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";

export const metadata = {
  title: "FINALTab — open source",
  description: "The FINALTab V2 monorepo: reproducible checks and the KeeperHub CLI contribution.",
};

const PACKAGES: Array<{ name: string; what: string }> = [
  {
    name: "packages/engine",
    what: "Deterministic money core — integer minor units, largest-remainder splits, debt netting, canonical V2 plan hashing, and EIP-3009 typed data.",
  },
  {
    name: "packages/vision",
    what: "Groq receipt extraction + natural-language allocation. Model output is always a proposal; the engine reconciles.",
  },
  {
    name: "packages/keeperhub",
    what: "Fail-closed KeeperHub client — simulate, execute, status. Refuses to report success it cannot prove.",
  },
  {
    name: "packages/keeperhub-flight-recorder",
    what: "kh-proof CLI: replays the verification chain for any executionId — terminal state, onchain receipt, verified flag.",
  },
  {
    name: "apps/web",
    what: "Next.js product, authenticated MCP boundary, hybrid voice safety, collaboration policies, KeeperHub discovery, V2 settlement preparation, and independent proof checks.",
  },
  {
    name: "contracts",
    what: "FinalTabBatchSettlementV2 — plan-bound pulls and payouts, consent, replay resistance, atomicity, expiry, and exact conservation. V1 remains only as regression history.",
  },
];

export default function OpenSourcePage() {
  return (
    <div className="marketing-shell editorial-shell text-txt">
      <PublicHeader active="open-source" />

      <main id="public-main" className="editorial-page editorial-arrive">
        <header className="editorial-hero">
          <div>
            <p className="editorial-kicker">Open source / Reproduce the rail</p>
            <h1 className="editorial-title">Inspect every boundary. Re-run every proof.</h1>
            <p className="editorial-lede">
              FINALTab is a pnpm monorepo. The money math is deterministic and tested; the AI layer only
              proposes; the KeeperHub layer is fail-closed. Safety-critical behavior is covered by unit,
              integration, contract, and Playwright checks you can run yourself.
            </p>
          </div>
          <dl className="editorial-fact-rail" aria-label="Repository summary">
            <div className="editorial-fact"><dt>6</dt><dd>Mapped monorepo surfaces</dd></div>
            <div className="editorial-fact"><dt>4</dt><dd>Test layers from unit to browser</dd></div>
            <div className="editorial-fact"><dt>V2</dt><dd>Active plan-bound contract path</dd></div>
          </dl>
        </header>

        <section className="editorial-section" aria-labelledby="packages-heading">
          <header className="editorial-section-index">
            <p className="editorial-section-number">01 / Map</p>
            <h2 id="packages-heading">Monorepo evidence map</h2>
            <p>Each surface owns a distinct part of the receipt-to-proof boundary. No package is presented as the whole system.</p>
          </header>
          <div className="editorial-section-body">
            <ol className="editorial-manifest">
              {PACKAGES.map((entry, index) => (
                <li key={entry.name} className="editorial-manifest-row">
                  <span className="font-mono text-xs text-faint" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <code className="break-words font-mono text-xs font-semibold text-paper">{entry.name}</code>
                  <p className="text-sm leading-6 text-muted">{entry.what}</p>
                  <span className="w-fit border border-quiet px-2 py-1 font-mono text-xs uppercase tracking-wider text-info">source</span>
                </li>
              ))}
            </ol>
            <aside className="editorial-callout editorial-callout-acid">
              <p className="font-mono text-xs font-semibold uppercase tracking-wider text-signal">One reproducible V2 path</p>
              <p className="mt-2 text-sm leading-6 text-muted">Model output remains a proposal. Integer arithmetic reconciles the ledger, external wallets consent to the exact plan, KeeperHub executes, and an independent Base Sepolia read either proves the result or returns it as unproven.</p>
            </aside>
          </div>
        </section>

        <section className="editorial-section" aria-labelledby="upstream-heading">
          <header className="editorial-section-index">
            <p className="editorial-section-number">02 / Contribute</p>
            <h2 id="upstream-heading">Upstream contribution ledger</h2>
            <p>Submitted work is labelled by its real review state. A pull request is not described as merged.</p>
          </header>
          <div className="editorial-section-body">
            <div className="editorial-proof">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-info">KeeperHub CLI / PR #95</p>
              <h3 className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-0.04em] text-paper">A submitted onboarding improvement, with status stated exactly.</h3>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-muted">
                We contributed an onboarding improvement to the KeeperHub CLI:{" "}
                <a href="https://github.com/KeeperHub/cli/pull/95" className="text-signal underline decoration-signal/40 underline-offset-2 hover:decoration-signal" target="_blank" rel="noopener noreferrer">KeeperHub/cli PR #95</a>.
                {" "}Status: <span className="font-mono text-xs text-warn">open</span> — it is a submitted pull request, not a merged one, and we label it exactly that.
              </p>
            </div>
          </div>
        </section>

        <section className="editorial-section" aria-labelledby="repo-heading">
          <header className="editorial-section-index">
            <p className="editorial-section-number">03 / Reproduce</p>
            <h2 id="repo-heading">Clone, test, inspect</h2>
            <p>The repository exposes the deterministic, integration, contract, and production-browser checks used by this product.</p>
          </header>
          <div className="editorial-section-body">
            <div className="editorial-endpoint">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-faint">Public repository</p>
                <a href="https://github.com/vaibhav4046/finaltab" className="mt-2 block break-all font-mono text-sm text-signal underline decoration-signal/40 underline-offset-2 hover:decoration-signal" target="_blank" rel="noopener noreferrer">github.com/vaibhav4046/finaltab</a>
              </div>
              <span className="border border-info/40 bg-info/10 px-3 py-2 font-mono text-xs uppercase tracking-wider text-info">pnpm workspace</span>
            </div>
            <p id="repository-commands-label" className="sr-only">Repository setup and test commands</p>
            <pre className="editorial-code lab-scroll mt-6" role="region" aria-labelledby="repository-commands-label" tabIndex={0}>
{`git clone https://github.com/vaibhav4046/finaltab
cd finaltab
pnpm install --frozen-lockfile
pnpm test       # deterministic unit, integration, and contract checks
pnpm test:e2e   # production build + desktop and mobile browser journeys`}
            </pre>
            <p className="mt-4 text-sm leading-6 text-muted">The browser suite covers mobile, desktop, and 4K public journeys. Authenticated settlement behavior remains additionally bounded by server validation, Supabase ownership policies, wallet consent, and independent proof checks.</p>
          </div>
        </section>

        <footer className="editorial-footer">
          <p>FINALTab / deterministic settlement infrastructure</p>
          <Link href="/developers" className="text-info hover:text-paper">Open the MCP integration guide →</Link>
        </footer>
      </main>
    </div>
  );
}

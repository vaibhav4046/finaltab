import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";

export const metadata = {
  title: "FINALTab — developers",
  description: "MCP endpoint, HTTP API surface, and proof verification for FINALTab.",
};

const MCP_TOOLS: Array<{ name: string; what: string }> = [
  { name: "split_equal", what: "Deterministic largest-remainder equal split of a fiat total." },
  { name: "split_weighted", what: "Weighted split — same remainder discipline, weights you pass in." },
  { name: "net_debts", what: "Debt netting: collapses who-owes-whom into the minimal transfer set." },
  { name: "get_balances", what: "Live USDC + ETH balances for the demo signers and relayer, read from Base Sepolia." },
  { name: "prepare_settlement", what: "Dry-run: canonicalizes the ledger, nets debts, returns settlementId + payouts. No broadcast." },
  { name: "settle_tab", what: "Signs EIP-3009 authorizations and broadcasts a real Base Sepolia settlement through KeeperHub. Requires confirm: true; without it, returns the dry-run." },
  { name: "settlement_status", what: "Reads a KeeperHub execution status and returns the honest verdict." },
];

const HTTP_ROUTES: Array<{ route: string; what: string }> = [
  { route: "POST /api/vision/extract", what: "Receipt image → structured line items (Groq vision, Zod-validated, arithmetic-checked)." },
  { route: "POST /api/vision/allocate", what: "Natural-language instruction → allocation proposal. Deterministic reconciler is the source of truth." },
  { route: "POST /api/settle/simulate", what: "Server-side KeeperHub simulation. Failing transfers are blocked before broadcast." },
  { route: "POST /api/settle/execute", what: "Submits the frozen, signed batch to KeeperHub on Base Sepolia." },
  { route: "GET /api/settle/status/:id", what: "Polls execution state. Returns VERIFIED_SETTLED only with an onchain receipt." },
  { route: "POST /api/mcp", what: "The MCP endpoint itself (JSON-RPC over HTTP)." },
];

const CLAUDE_CONFIG = `{
  "mcpServers": {
    "finaltab": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://finaltab.vercel.app/api/mcp"]
    }
  }
}`;

export default function DevelopersPage() {
  return (
    <div className="min-h-screen bg-canvas text-txt">
      <PublicHeader active="developers" />

      <main className="atmosphere mx-auto max-w-5xl px-4 pb-24 pt-14 sm:px-6">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-signal">Developers</p>
        <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-paper sm:text-4xl">
          The settlement rail is an API. Point an agent at it.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
          Everything the web app does — split, net, freeze, simulate, execute, verify — is exposed as
          HTTP routes and an MCP server. The lists below contain only what is actually deployed. No
          roadmap items dressed up as features.
        </p>

        {/* MCP */}
        <section className="mt-14" aria-labelledby="mcp-heading">
          <h2 id="mcp-heading" className="font-mono text-sm font-semibold uppercase tracking-wider text-paper">
            01 · MCP server
          </h2>
          <div className="mt-4 rounded-lg border border-quiet bg-surface-1 p-5">
            <p className="font-mono text-[11px] uppercase tracking-wider text-faint">Endpoint</p>
            <p className="mt-1 break-all font-mono text-sm text-signal">https://finaltab.vercel.app/api/mcp</p>
            <div className="mt-5 space-y-2">
              {MCP_TOOLS.map((t) => (
                <div key={t.name} className="flex flex-col gap-1 rounded-md border border-quiet-soft bg-surface-2 px-3.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
                  <code className="shrink-0 font-mono text-xs font-semibold text-paper">{t.name}</code>
                  <p className="text-xs leading-relaxed text-muted">{t.what}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 font-mono text-[11px] leading-relaxed text-faint">
              Seven tools, because seven tools exist. settle_tab moves real testnet money: it is
              gated behind an explicit confirm flag, simulates before broadcasting, and fails closed
              — success is reported only after independent onchain receipt verification. The other
              six are read-and-compute.
            </p>
          </div>

          <div className="mt-6 rounded-lg border border-quiet bg-surface-1 p-5">
            <p className="font-mono text-[11px] uppercase tracking-wider text-faint">
              Connect from Claude Desktop — claude_desktop_config.json
            </p>
            <pre className="lab-scroll mt-3 overflow-x-auto rounded-md border border-quiet-soft bg-canvas p-4 font-mono text-xs leading-relaxed text-paper-dim">
              {CLAUDE_CONFIG}
            </pre>
          </div>
        </section>

        {/* HTTP API */}
        <section className="mt-14" aria-labelledby="http-heading">
          <h2 id="http-heading" className="font-mono text-sm font-semibold uppercase tracking-wider text-paper">
            02 · HTTP surface
          </h2>
          <div className="mt-4 space-y-2">
            {HTTP_ROUTES.map((r) => (
              <div key={r.route} className="flex flex-col gap-1 rounded-md border border-quiet bg-surface-1 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
                <code className="shrink-0 font-mono text-xs font-semibold text-info">{r.route}</code>
                <p className="text-xs leading-relaxed text-muted">{r.what}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 font-mono text-[11px] leading-relaxed text-faint">
            Vision and KeeperHub keys live server-side only. Routes return 501 — not a mock — when a
            provider is not configured.
          </p>
        </section>

        {/* Proof verification */}
        <section className="mt-14" aria-labelledby="proof-heading">
          <h2 id="proof-heading" className="font-mono text-sm font-semibold uppercase tracking-wider text-paper">
            03 · Verify a settlement yourself
          </h2>
          <div className="mt-4 rounded-lg border border-quiet bg-surface-1 p-5">
            <p className="text-sm leading-relaxed text-muted">
              Every verified settlement carries an executionId and a transaction hash. The{" "}
              <code className="font-mono text-xs text-paper">@finaltab/keeperhub-flight-recorder</code>{" "}
              package in the repo ships a <code className="font-mono text-xs text-paper">kh-proof</code>{" "}
              CLI that replays the verification chain — KeeperHub terminal state, onchain receipt,
              verified flag — for any executionId. Clone the repo, install, and run it against the
              live proof shown on{" "}
              <Link href="/app/proof" className="text-signal underline decoration-signal/40 underline-offset-2 hover:decoration-signal">
                the Settlement Capsule
              </Link>
              .
            </p>
            <div className="mt-4 rounded-md border border-quiet-soft bg-canvas p-4">
              <p className="font-mono text-[11px] uppercase tracking-wider text-faint">Live reference proof — agent-driven, via MCP</p>
              <p className="mt-2 break-all font-mono text-xs text-paper-dim">
                executionId 69zzrj7z676u89ce1x76j · Base Sepolia block 45315909 · VERIFIED_SETTLED
              </p>
            </div>
          </div>
        </section>

        <footer className="mt-16 border-t border-quiet pt-6">
          <p className="font-mono text-[11px] text-faint">
            Source:{" "}
            <a
              href="https://github.com/vaibhav4046/finaltab"
              className="text-muted underline decoration-quiet underline-offset-2 hover:text-paper"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/vaibhav4046/finaltab
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}

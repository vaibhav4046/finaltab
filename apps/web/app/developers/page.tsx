import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";

export const metadata = {
  title: "FINALTab — developers",
  description: "Authenticated MCP v2, HTTP APIs, configuration-gated hybrid voice, external wallet approvals, and independent settlement proof.",
};

interface ToolDescription {
  name: string;
  scope: string;
  what: string;
}

const PRODUCTION_TOOLS: ToolDescription[] = [
  { name: "split_equal", scope: "tabs:read", what: "Cent-perfect equal split with deterministic largest remainder." },
  { name: "split_weighted", scope: "tabs:read", what: "Cent-perfect weighted split with stable tie-breaking." },
  { name: "net_debts", scope: "tabs:read", what: "Collapse an arbitrary debt graph into at most n−1 transfers." },
  { name: "allocate_receipt", scope: "settlements:prepare", what: "Allocate caller-supplied items, tax, service, and tip across arbitrary participants." },
  { name: "prepare_receipt_settlement", scope: "settlements:prepare", what: "Freeze the V2 plan and return both typed-data payloads each debtor signs in their own wallet." },
  { name: "simulate_signed_settlement", scope: "settlements:prepare", what: "Validate the externally signed V2 payload and simulate the exact KeeperHub call. No broadcast." },
  { name: "create_broadcast_approval_challenge", scope: "settlements:prepare", what: "Create a short-lived EIP-191 approval message bound to the principal and exact plan; retries are valid until expiry." },
  { name: "submit_signed_settlement", scope: "settlements:submit", what: "Journal new work before one idempotent KeeperHub call; accepted retries skip simulation and execution." },
  { name: "settlement_status", scope: "settlements:read", what: "Combine KeeperHub proof with an independent Base Sepolia receipt and exact V2 settlementId + ledgerHash check." },
];

const JOURNEY = [
  ["01", "Allocate", "Reconcile every receipt line to the cent."],
  ["02", "Freeze V2", "Bind chain, contract, token, ledger, every debit, and every payout."],
  ["03", "Wallet-sign", "Each debtor signs USDC pull + FINALTab full-plan consent."],
  ["04", "Simulate", "KeeperHub proves the exact call will not revert."],
  ["05", "Human approve", "A reviewed EIP-191 artifact binds principal, plan, ID, and expiry."],
  ["06", "Submit", "Journal first; new work broadcasts once. Accepted retries only replay the durable result."],
  ["07", "Prove", "KeeperHub receipt + independent RPC + exact V2 plan binding, or UNPROVEN."],
] as const;

const HTTP_ROUTES: Array<{ route: string; what: string }> = [
  { route: "POST /api/vision/extract", what: "Receipt image → structured lines; authenticated, size-bounded, Zod-validated, arithmetic-checked." },
  { route: "POST /api/vision/allocate", what: "Natural-language proposal → deterministic reconciliation. The model never decides the final cents." },
  { route: "POST /api/voice/token", what: "Supabase user session/JWT only; receipts:write, atomic 180-second reservation, 8/min, 1-user/4-project concurrency." },
  { route: "POST /api/voice/speak", what: "Supabase user session/JWT only; tabs:read, atomic 1-600-character reservation, 20/min, 2,048-byte body cap." },
  { route: "POST /api/settle/simulate", what: "Server-side KeeperHub simulation of a caller-signed V2 payload." },
  { route: "POST /api/settle/approval", what: "Create the principal + exact-plan EIP-191 challenge a debtor wallet must sign." },
  { route: "POST /api/settle/execute", what: "Use the shared durable journal; new work simulates and submits once, while accepted retries never execute again." },
  { route: "GET /api/settle/status/:id", what: "Fail-closed status with KeeperHub and independent Base Sepolia verification." },
  { route: "POST /api/mcp", what: "Authenticated MCP Streamable HTTP endpoint (JSON-RPC over HTTPS)." },
];

const CODEX_CONFIG = `[mcp_servers.finaltab]
url = "https://finaltab.vercel.app/api/mcp"
bearer_token_env_var = "FINALTAB_MCP_TOKEN"
required = true
tool_timeout_sec = 60
enabled_tools = [
  "split_equal", "split_weighted", "net_debts", "allocate_receipt",
  "prepare_receipt_settlement", "simulate_signed_settlement",
  "create_broadcast_approval_challenge", "submit_signed_settlement",
  "settlement_status"
]
default_tools_approval_mode = "writes"

[mcp_servers.finaltab.tools.submit_signed_settlement]
approval_mode = "prompt"`;

const CLAUDE_CONFIG = `{
  "mcpServers": {
    "finaltab": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "https://finaltab.vercel.app/api/mcp",
        "--header", "Authorization:\${FINALTAB_AUTH_HEADER}"
      ],
      "env": {
        "FINALTAB_AUTH_HEADER": "Bearer <your ft_ token>"
      }
    }
  }
}`;

const CURL_EXAMPLE = `curl -N https://finaltab.vercel.app/api/mcp \\
  -H "Authorization: Bearer \${FINALTAB_MCP_TOKEN}" \\
  -H "Accept: application/json, text/event-stream" \\
  -H "Content-Type: application/json" \\
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"split_equal","arguments":{"total":"54.01","people":["alex","blair","casey"]}}}'`;

function ToolManifest({ tools, testId }: { tools: ToolDescription[]; testId?: string }) {
  return (
    <ol className="editorial-manifest" data-testid={testId}>
      {tools.map((tool, index) => (
        <li
          key={tool.name}
          className="editorial-manifest-row"
        >
          <span className="font-mono text-xs text-faint" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <code className="break-words font-mono text-xs font-semibold text-paper">{tool.name}</code>
          <p className="text-sm leading-6 text-muted">{tool.what}</p>
          <code className="w-fit border border-quiet px-2 py-1 font-mono text-xs uppercase tracking-wider text-info">
            {tool.scope}
          </code>
        </li>
      ))}
    </ol>
  );
}

export default function DevelopersPage() {
  return (
    <div className="marketing-shell editorial-shell text-txt">
      <PublicHeader active="developers" />

      <main id="public-main" className="editorial-page editorial-arrive">
        <header className="editorial-hero">
          <div>
            <p className="editorial-kicker">Developers / MCP v2.0</p>
            <h1 className="editorial-title">One receipt-to-proof rail. Any MCP-capable agent.</h1>
            <p className="editorial-lede">
              FINALTab exposes deterministic money math and a production user-wallet settlement path.
              Models propose; integer arithmetic reconciles; wallets approve; KeeperHub executes; an
              independent RPC proves the result. The server never holds arbitrary users&apos; keys.
            </p>
          </div>
          <dl className="editorial-fact-rail" aria-label="MCP boundary summary">
            <div className="editorial-fact"><dt>9</dt><dd>Authenticated production tools</dd></div>
            <div className="editorial-fact"><dt>0</dt><dd>Broadcasts from simulation</dd></div>
            <div className="editorial-fact"><dt>V2</dt><dd>Plan-bound wallet consent</dd></div>
          </dl>
        </header>

        <section className="editorial-section" aria-labelledby="mcp-heading">
          <header className="editorial-section-index">
            <p className="editorial-section-number">01 / Execute</p>
            <h2 id="mcp-heading">MCP execution rail</h2>
            <p>Nine scoped tools. Read and prepare operations remain separate from the one value-moving submission tool.</p>
          </header>
          <div className="editorial-section-body">
            <div className="editorial-endpoint">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-faint">Streamable HTTP / authenticated</p>
                <p className="mt-2 break-all font-mono text-sm text-signal">https://finaltab.vercel.app/api/mcp</p>
              </div>
              <span className="border border-signal/40 bg-signal/10 px-3 py-2 font-mono text-xs uppercase tracking-wider text-signal">9 production tools</span>
            </div>

            <ol className="tool-progress lab-scroll" aria-label="Settlement tool progression">
              {JOURNEY.map(([number, title, body]) => (
                <li key={number} className="tool-progress-item">
                  <span className="tool-progress-marker">{number}</span>
                  <p className="mt-4 text-sm font-semibold text-paper">{title}</p>
                  <p className="mt-2 text-xs leading-5 text-faint">{body}</p>
                </li>
              ))}
            </ol>

            <p className="mt-8 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-faint">Production manifest</p>
            <ToolManifest tools={PRODUCTION_TOOLS} testId="mcp-production-tools" />

            <aside className="editorial-callout editorial-callout-acid">
              <p className="font-mono text-xs font-semibold uppercase tracking-wider text-signal">Production manifest only</p>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted">
                The public agent surface contains the nine authenticated tools above. Value movement still
                requires debtor-wallet consent, scoped authorization, KeeperHub simulation, and an exact-plan
                human approval artifact before any broadcast.
              </p>
            </aside>
          </div>
        </section>

        <section className="editorial-section" aria-labelledby="security-heading">
          <header className="editorial-section-index">
            <p className="editorial-section-number">02 / Authorize</p>
            <h2 id="security-heading">Auth and the money boundary</h2>
            <p>Identity, intent, and execution are separate proofs. A boolean cannot stand in for consent.</p>
          </header>
          <div className="editorial-section-body">
            <div className="editorial-evidence-grid">
              <article className="editorial-evidence-block">
                <h3 className="text-lg font-semibold tracking-tight text-paper">Scoped Bearer access</h3>
                <p className="mt-3 text-sm leading-6 text-muted">
                  Production requests need a Supabase session/JWT or a scoped bearer token. A same-origin
                  product session may submit only with the additional exact-plan debtor-wallet ceremony;
                  bearer clients always need an explicit settlements:submit scope. Static tokens are compared
                  by SHA-256 digest; plaintext tokens are never stored in server configuration. JSON-RPC batches
                  must satisfy every scope they invoke.
                </p>
                <div className="mt-5 flex flex-wrap gap-2 font-mono text-xs text-info">
                  {["tabs:read", "settlements:prepare", "settlements:read", "settlements:submit"].map((scope) => (
                    <span key={scope} className="border border-quiet px-2 py-1">{scope}</span>
                  ))}
                </div>
              </article>
              <article className="editorial-evidence-block">
                <h3 className="text-lg font-semibold tracking-tight text-paper">No boolean “approval”</h3>
                <p className="mt-3 text-sm leading-6 text-muted">
                  <code className="font-mono text-paper">confirm: true</code> is not accepted. A value-moving call needs
                  every debtor&apos;s two V2 signatures and a 60–900 second EIP-191 artifact signed after human review.
                  It binds the authenticated principal, contract, ledger, plan, unique approval ID, and expiry.
                  The artifact may be retried until expiry; deterministic KeeperHub idempotency and V2 settlement
                  state prevent duplicate settlement.
                </p>
              </article>
            </div>

            <aside className="editorial-callout">
              <p className="font-mono text-xs font-semibold uppercase tracking-wider text-info">Durable crash recovery</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                First-party UI, REST, and MCP submissions share one server-authored journal. A durably accepted retry
                returns the recorded execution without another simulation or KeeperHub execute call. A prepared retry
                reuses its stored successful simulation and deterministic idempotency key while the persisted approval
                lease remains bounded. Fresh first-party work still needs current database approvals and a valid wallet
                approval at the final pre-broadcast gate.
              </p>
            </aside>

            <div className="editorial-code-panel">
              <p className="font-mono text-xs font-semibold uppercase tracking-wider text-faint">Safe local token bootstrap</p>
              <pre className="editorial-code lab-scroll">pnpm mcp:bootstrap-token</pre>
              <p className="mt-3 text-xs leading-6 text-faint">
                The script writes the raw <code className="font-mono text-paper-dim">ft_</code> token only to the gitignored
                <code className="font-mono text-paper-dim"> proof-output/finaltab-mcp-token.local.json</code>. stdout contains only its SHA-256 digest and config metadata.
                The default token cannot broadcast; add <code className="font-mono text-paper-dim">-- --allow-settlement-submit</code> only for an MCP client that needs the value-moving tool.
              </p>
            </div>
          </div>
        </section>

        <section className="editorial-section" aria-labelledby="connect-heading">
          <header className="editorial-section-index">
            <p className="editorial-section-number">03 / Connect</p>
            <h2 id="connect-heading">Connect an agent</h2>
            <p>Use the same authenticated endpoint from Codex, ChatGPT, Claude Desktop, or raw JSON-RPC.</p>
          </header>
          <div className="editorial-section-body editorial-stack">
            <article className="editorial-code-panel">
              <p id="codex-mcp-config-label" className="font-mono text-xs font-semibold uppercase tracking-wider text-faint">Codex + ChatGPT desktop / ~/.codex/config.toml</p>
              <p className="mt-2 text-sm leading-6 text-muted">Set <code className="font-mono text-paper">FINALTAB_MCP_TOKEN</code> in the environment that launches the client. ChatGPT desktop, Codex CLI, and the Codex IDE extension share this configuration.</p>
              <pre className="editorial-code lab-scroll" data-testid="codex-mcp-config" role="region" aria-labelledby="codex-mcp-config-label" tabIndex={0}>{CODEX_CONFIG}</pre>
              <a href="https://learn.chatgpt.com/docs/extend/mcp?surface=cli" target="_blank" rel="noopener noreferrer" className="touch-target mt-3 inline-flex items-center text-xs text-info underline decoration-info/40 underline-offset-2">OpenAI MCP configuration reference ↗</a>
            </article>

            <article className="editorial-code-panel">
              <p className="font-mono text-xs font-semibold uppercase tracking-wider text-faint">ChatGPT web / plugin developer mode</p>
              <p className="mt-2 text-sm leading-6 text-muted">ChatGPT web does not read local Codex configuration. In a workspace that permits developer plugins, open Plugins, select <span className="text-paper">+</span>, and connect the HTTPS endpoint above. Review the discovered tools and keep write actions approval-gated. Workspace policy and authentication support determine availability.</p>
            </article>

            <article className="editorial-code-panel">
              <p id="claude-mcp-config-label" className="font-mono text-xs font-semibold uppercase tracking-wider text-faint">Claude Desktop / claude_desktop_config.json</p>
              <p className="mt-2 text-sm leading-6 text-muted">This uses the open-source <code className="font-mono text-paper">mcp-remote</code> bridge. The header form below avoids the Windows argument-space issue documented by that project.</p>
              <pre className="editorial-code lab-scroll" data-testid="claude-mcp-config" role="region" aria-labelledby="claude-mcp-config-label" tabIndex={0}>{CLAUDE_CONFIG}</pre>
            </article>

            <article className="editorial-code-panel">
              <p id="curl-mcp-example-label" className="font-mono text-xs font-semibold uppercase tracking-wider text-faint">Raw JSON-RPC / curl</p>
              <pre className="editorial-code lab-scroll" data-testid="mcp-curl-example" role="region" aria-labelledby="curl-mcp-example-label" tabIndex={0}>{CURL_EXAMPLE}</pre>
              <p className="mt-3 text-xs leading-6 text-faint">Expected shares: 18.01, 18.00, 18.00. The sum remains exactly 54.01.</p>
            </article>
          </div>
        </section>

        <section className="editorial-section" aria-labelledby="http-heading">
          <header className="editorial-section-index">
            <p className="editorial-section-number">04 / Integrate</p>
            <h2 id="http-heading">HTTP surface</h2>
            <p>Bounded JSON endpoints share the same fail-closed provider and settlement boundaries.</p>
          </header>
          <div className="editorial-section-body">
            <div className="editorial-route-list">
              {HTTP_ROUTES.map((route) => (
                <div key={route.route} className="editorial-route-row">
                  <code className="font-mono text-xs font-semibold text-info">{route.route}</code>
                  <p className="text-sm leading-6 text-muted">{route.what}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 font-mono text-xs leading-6 text-faint">Provider secrets stay server-side. Missing providers and missing V2 configuration fail closed; they never synthesize success.</p>
          </div>
        </section>

        <section className="editorial-section" aria-labelledby="voice-heading">
          <header className="editorial-section-index">
            <p className="editorial-section-number">05 / Voice</p>
            <h2 id="voice-heading">Hybrid voice, configuration-gated</h2>
            <p>The shipped boundary is not a claim that either paid provider is enabled in production.</p>
          </header>
          <div className="editorial-section-body">
            <div className="editorial-evidence-grid">
              <article className="editorial-evidence-block">
                <h3 className="text-lg font-semibold tracking-tight text-paper">AssemblyAI / live speech-to-text</h3>
                <p className="mt-3 text-sm leading-6 text-muted">When AssemblyAI is configured on the server, FINALTab mints a short-lived redemption credential and returns constrained EU streaming settings for at most 180 seconds of transcription. The permanent provider key never enters the browser, OpenAPI response, or repository.</p>
              </article>
              <article className="editorial-evidence-block">
                <h3 className="text-lg font-semibold tracking-tight text-paper">ElevenLabs / spoken readback</h3>
                <p className="mt-3 text-sm leading-6 text-muted">When ElevenLabs is configured on the server, FINALTab returns a short uncached MP3 confirmation that the current browser client buffers before playback. This interactive readback is distinct from the product-video narration: the prerecorded video voiceover uses ElevenLabs only, not AssemblyAI.</p>
              </article>
            </div>
            <aside className="editorial-callout editorial-callout-warn">
              <p className="text-sm leading-6 text-muted">Paid voice requires a signed-in Supabase user through a same-origin cookie session or validated Supabase bearer JWT; opaque FINALTab API tokens are deliberately rejected. Before a provider boundary, the applied service-role-only spend boundary atomically enforces per-user and project UTC-day/month budgets alongside the fixed-minute limits (8 transcription requests, 20 readbacks), and 1-user/4-project transcription concurrency. Storage and missing provider configuration fail closed before any success is reported. Presence in source or OpenAPI does not claim that either provider is enabled on the currently deployed site.</p>
            </aside>
          </div>
        </section>

        <section className="editorial-section" aria-labelledby="proof-heading">
          <header className="editorial-section-index">
            <p className="editorial-section-number">06 / Verify</p>
            <h2 id="proof-heading">Verify a settlement yourself</h2>
            <p>Success requires KeeperHub state, an independent Base Sepolia receipt, and exact V2 plan hashes.</p>
          </header>
          <div className="editorial-section-body editorial-proof">
            <p className="max-w-4xl text-base leading-7 text-muted">Open a real KeeperHub execution ID together with its frozen settlementId and ledgerHash in the Settlement Capsule. FINALTab does not render a prewritten success state: it fetches KeeperHub, re-fetches Base Sepolia independently, and requires the successful V2 <code className="font-mono text-sm text-paper">SettlementExecuted</code> event from the configured contract with both indexed plan hashes matching.</p>
            <Link href="/app/proof" className="touch-target mt-6 inline-flex items-center rounded-lg bg-signal px-5 font-mono text-xs font-semibold uppercase tracking-wider text-ink transition-colors hover:bg-signal-dim">Open Settlement Capsule →</Link>
          </div>
        </section>

        <footer className="editorial-footer">
          <p>Source: <a href="https://github.com/vaibhav4046/finaltab" className="text-muted underline decoration-quiet underline-offset-2 hover:text-paper" target="_blank" rel="noopener noreferrer">github.com/vaibhav4046/finaltab</a></p>
          <Link href="/open-source" className="text-info hover:text-paper">Read the repository map →</Link>
        </footer>
      </main>
    </div>
  );
}

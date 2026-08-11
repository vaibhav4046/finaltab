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
  { name: "submit_signed_settlement", scope: "settlements:submit", what: "Verify human approval, re-simulate, and submit one idempotent atomic V2 call through KeeperHub." },
  { name: "settlement_status", scope: "settlements:read", what: "Combine KeeperHub proof with an independent Base Sepolia receipt and exact V2 settlementId + ledgerHash check." },
];

const DEMO_TOOLS: ToolDescription[] = [
  { name: "demo_get_balances", scope: "settlements:read", what: "Read the three fixed Base Sepolia fixture wallets. Disabled by default." },
  { name: "demo_prepare_settlement", scope: "settlements:prepare", what: "Prepare the fixed Vee/Hem/Ravi test fixture. Never the production user path." },
  { name: "demo_settle_tab", scope: "settlements:submit", what: "Move fixture testnet USDC only after a configured human operator signs an approval artifact." },
];

const JOURNEY = [
  ["01", "Allocate", "Reconcile every receipt line to the cent."],
  ["02", "Freeze V2", "Bind chain, contract, token, ledger, every debit, and every payout."],
  ["03", "Wallet-sign", "Each debtor signs USDC pull + FINALTab full-plan consent."],
  ["04", "Simulate", "KeeperHub proves the exact call will not revert."],
  ["05", "Human approve", "A reviewed EIP-191 artifact binds principal, plan, ID, and expiry."],
  ["06", "Submit", "Re-simulate, then broadcast one idempotent atomic call."],
  ["07", "Prove", "KeeperHub receipt + independent RPC + exact V2 plan binding, or UNPROVEN."],
] as const;

const HTTP_ROUTES: Array<{ route: string; what: string }> = [
  { route: "POST /api/vision/extract", what: "Receipt image → structured lines; authenticated, size-bounded, Zod-validated, arithmetic-checked." },
  { route: "POST /api/vision/allocate", what: "Natural-language proposal → deterministic reconciliation. The model never decides the final cents." },
  { route: "POST /api/voice/token", what: "Configuration-gated AssemblyAI live-STT bootstrap; receipts:write, no request body, short-lived browser credential only." },
  { route: "POST /api/voice/speak", what: "Configuration-gated ElevenLabs MP3 readback; tabs:read, 2,048-byte body cap, 1-600 normalized characters." },
  { route: "POST /api/settle/simulate", what: "Server-side KeeperHub simulation of a caller-signed V2 payload." },
  { route: "POST /api/settle/approval", what: "Create the principal + exact-plan EIP-191 challenge a debtor wallet must sign." },
  { route: "POST /api/settle/execute", what: "Verify the short-lived approval, re-simulate, then submit the frozen V2 batch through KeeperHub." },
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
    <div className="space-y-2" data-testid={testId}>
      {tools.map((tool) => (
        <div
          key={tool.name}
          className="grid gap-2 rounded-md border border-quiet-soft bg-surface-2 px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
        >
          <div>
            <code className="font-mono text-xs font-semibold text-paper">{tool.name}</code>
            <p className="mt-1 text-xs leading-relaxed text-muted">{tool.what}</p>
          </div>
          <code className="w-fit rounded-full border border-quiet px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-info">
            {tool.scope}
          </code>
        </div>
      ))}
    </div>
  );
}

export default function DevelopersPage() {
  return (
    <div className="min-h-screen bg-canvas text-txt">
      <PublicHeader active="developers" />

      <main className="atmosphere mx-auto max-w-5xl px-4 pb-24 pt-14 sm:px-6">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-signal">Developers · MCP v2.0</p>
        <h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-paper sm:text-5xl">
          One receipt-to-proof rail. Any MCP-capable agent.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted">
          FINALTab exposes deterministic money math and a production user-wallet settlement path.
          Models propose; integer arithmetic reconciles; wallets approve; KeeperHub executes; an
          independent RPC proves the result. The server never holds arbitrary users&apos; keys.
        </p>

        <section className="mt-14" aria-labelledby="mcp-heading">
          <h2 id="mcp-heading" className="font-mono text-sm font-semibold uppercase tracking-wider text-paper">
            01 · MCP server
          </h2>
          <div className="mt-4 rounded-lg border border-quiet bg-surface-1 p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-faint">Streamable HTTP · authenticated</p>
                <p className="mt-1 break-all font-mono text-sm text-signal">https://finaltab.vercel.app/api/mcp</p>
              </div>
              <span className="w-fit rounded-full border border-signal/40 bg-signal/10 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-signal">
                9 production tools
              </span>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {JOURNEY.map(([number, title, body]) => (
                <div key={number} className="rounded-md border border-quiet-soft bg-canvas p-3">
                  <p className="font-mono text-[10px] text-signal">{number}</p>
                  <p className="mt-2 text-sm font-semibold text-paper">{title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-faint">{body}</p>
                </div>
              ))}
            </div>

            <div className="mt-7">
              <p className="mb-3 font-mono text-[11px] uppercase tracking-wider text-faint">Production manifest</p>
              <ToolManifest tools={PRODUCTION_TOOLS} testId="mcp-production-tools" />
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-warn/35 bg-warn/5 p-5">
            <p className="font-mono text-[11px] uppercase tracking-wider text-warn">Testnet fixture · off by default</p>
            <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted">
              The fixed Vee/Hem/Ravi path is retained only for controlled Base Sepolia demonstrations.
              It requires an explicit server feature flag, a V2 contract gate, scoped auth, and a
              configured human operator approval. It is not the production workflow.
            </p>
            <div className="mt-4">
              <ToolManifest tools={DEMO_TOOLS} testId="mcp-demo-tools" />
            </div>
          </div>
        </section>

        <section className="mt-14" aria-labelledby="security-heading">
          <h2 id="security-heading" className="font-mono text-sm font-semibold uppercase tracking-wider text-paper">
            02 · Auth and the money boundary
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-quiet bg-surface-1 p-5">
              <p className="text-sm font-semibold text-paper">Scoped Bearer access</p>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Production requests need a Supabase session/JWT or a scoped bearer token. A same-origin
                product session may submit only with the additional exact-plan debtor-wallet ceremony;
                bearer clients always need an explicit settlements:submit scope. Static
                tokens are compared by SHA-256 digest; plaintext tokens are never stored in server
                configuration. JSON-RPC batches must satisfy every scope they invoke.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 font-mono text-[10px] text-info">
                {['tabs:read', 'settlements:prepare', 'settlements:read', 'settlements:submit'].map((scope) => (
                  <span key={scope} className="rounded-full border border-quiet px-2 py-1">{scope}</span>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-quiet bg-surface-1 p-5">
              <p className="text-sm font-semibold text-paper">No boolean “approval”</p>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                <code className="font-mono text-paper">confirm: true</code> is not accepted. A value-moving call needs
                every debtor&apos;s two V2 signatures and a 60–900 second EIP-191 artifact signed after
                human review. It binds the authenticated principal, contract, ledger, plan, unique
                approval ID, and expiry. The artifact may be retried until expiry; deterministic
                KeeperHub idempotency and V2 settlement state prevent duplicate settlement.
              </p>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-quiet bg-surface-1 p-5">
            <p className="font-mono text-[11px] uppercase tracking-wider text-faint">Safe local token bootstrap</p>
            <pre className="lab-scroll mt-3 overflow-x-auto rounded-md border border-quiet-soft bg-canvas p-4 font-mono text-xs leading-relaxed text-paper-dim">
              pnpm mcp:bootstrap-token
            </pre>
            <p className="mt-3 text-[11px] leading-relaxed text-faint">
              The script writes the raw <code className="font-mono text-paper-dim">ft_</code> token only to the gitignored
              <code className="font-mono text-paper-dim"> proof-output/finaltab-mcp-token.local.json</code>. stdout contains only its SHA-256 digest and config metadata.
              The default token cannot broadcast; add <code className="font-mono text-paper-dim">-- --allow-settlement-submit</code> only for an MCP client that needs the value-moving tool.
            </p>
          </div>
        </section>

        <section className="mt-14" aria-labelledby="connect-heading">
          <h2 id="connect-heading" className="font-mono text-sm font-semibold uppercase tracking-wider text-paper">
            03 · Connect an agent
          </h2>
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-quiet bg-surface-1 p-5">
              <p id="codex-mcp-config-label" className="font-mono text-[11px] uppercase tracking-wider text-faint">
                Codex + ChatGPT desktop · ~/.codex/config.toml
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Set <code className="font-mono text-paper">FINALTAB_MCP_TOKEN</code> in the environment that launches the client.
                ChatGPT desktop, Codex CLI, and the Codex IDE extension share this configuration.
              </p>
              <pre
                className="lab-scroll mt-3 overflow-x-auto rounded-md border border-quiet-soft bg-canvas p-4 font-mono text-xs leading-relaxed text-paper-dim"
                data-testid="codex-mcp-config"
                role="region"
                aria-labelledby="codex-mcp-config-label"
                tabIndex={0}
              >
                {CODEX_CONFIG}
              </pre>
              <a
                href="https://learn.chatgpt.com/docs/extend/mcp?surface=cli"
                target="_blank"
                rel="noopener noreferrer"
                className="touch-target mt-3 inline-flex items-center text-xs text-info underline decoration-info/40 underline-offset-2"
              >
                OpenAI MCP configuration reference ↗
              </a>
            </div>

            <div className="rounded-lg border border-quiet bg-surface-1 p-5">
              <p className="font-mono text-[11px] uppercase tracking-wider text-faint">ChatGPT web · plugin developer mode</p>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                ChatGPT web does not read local Codex configuration. In a workspace that permits
                developer plugins, open Plugins, select <span className="text-paper">+</span>, and connect the HTTPS endpoint above.
                Review the discovered tools and keep write actions approval-gated. Workspace policy
                and authentication support determine availability.
              </p>
            </div>

            <div className="rounded-lg border border-quiet bg-surface-1 p-5">
              <p id="claude-mcp-config-label" className="font-mono text-[11px] uppercase tracking-wider text-faint">
                Claude Desktop · claude_desktop_config.json
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                This uses the open-source <code className="font-mono text-paper">mcp-remote</code> bridge. The header form below avoids the Windows argument-space issue documented by that project.
              </p>
              <pre
                className="lab-scroll mt-3 overflow-x-auto rounded-md border border-quiet-soft bg-canvas p-4 font-mono text-xs leading-relaxed text-paper-dim"
                data-testid="claude-mcp-config"
                role="region"
                aria-labelledby="claude-mcp-config-label"
                tabIndex={0}
              >
                {CLAUDE_CONFIG}
              </pre>
            </div>

            <div className="rounded-lg border border-quiet bg-surface-1 p-5">
              <p id="curl-mcp-example-label" className="font-mono text-[11px] uppercase tracking-wider text-faint">Raw JSON-RPC · curl</p>
              <pre
                className="lab-scroll mt-3 overflow-x-auto rounded-md border border-quiet-soft bg-canvas p-4 font-mono text-xs leading-relaxed text-paper-dim"
                data-testid="mcp-curl-example"
                role="region"
                aria-labelledby="curl-mcp-example-label"
                tabIndex={0}
              >
                {CURL_EXAMPLE}
              </pre>
              <p className="mt-3 text-[11px] leading-relaxed text-faint">Expected shares: 18.01, 18.00, 18.00. The sum remains exactly 54.01.</p>
            </div>
          </div>
        </section>

        <section className="mt-14" aria-labelledby="http-heading">
          <h2 id="http-heading" className="font-mono text-sm font-semibold uppercase tracking-wider text-paper">
            04 · HTTP surface
          </h2>
          <div className="mt-4 space-y-2">
            {HTTP_ROUTES.map((route) => (
              <div key={route.route} className="flex flex-col gap-1 rounded-md border border-quiet bg-surface-1 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
                <code className="shrink-0 font-mono text-xs font-semibold text-info">{route.route}</code>
                <p className="text-xs leading-relaxed text-muted">{route.what}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 font-mono text-[11px] leading-relaxed text-faint">
            Provider secrets stay server-side. Missing providers and missing V2 configuration fail closed; they never fall back to fake success.
          </p>
        </section>

        <section className="mt-14" aria-labelledby="voice-heading">
          <h2 id="voice-heading" className="font-mono text-sm font-semibold uppercase tracking-wider text-paper">
            05 · Hybrid voice · configuration-gated
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-quiet bg-surface-1 p-5">
              <p className="text-sm font-semibold text-paper">AssemblyAI · live speech-to-text</p>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                When AssemblyAI is configured on the server, FINALTab mints a short-lived redemption
                credential and returns constrained EU streaming settings for interactive transcription.
                The permanent provider key never enters the browser, OpenAPI response, or repository.
              </p>
            </div>
            <div className="rounded-lg border border-quiet bg-surface-1 p-5">
              <p className="text-sm font-semibold text-paper">ElevenLabs · spoken readback</p>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                When ElevenLabs is configured on the server, FINALTab returns a short uncached MP3
                confirmation that the current browser client buffers before playback. This interactive readback is distinct from the product-demo narration:
                the prerecorded demo voiceover uses ElevenLabs only, not AssemblyAI.
              </p>
            </div>
          </div>
          <p className="mt-4 rounded-md border border-warn/30 bg-warn/5 px-4 py-3 text-xs leading-relaxed text-muted">
            These routes fail closed when provider configuration is absent. Their presence in source or
            OpenAPI does not claim that either provider is enabled on the currently deployed site.
          </p>
        </section>

        <section className="mt-14" aria-labelledby="proof-heading">
          <h2 id="proof-heading" className="font-mono text-sm font-semibold uppercase tracking-wider text-paper">
            06 · Verify a settlement yourself
          </h2>
          <div className="mt-4 rounded-lg border border-quiet bg-surface-1 p-5">
            <p className="text-sm leading-relaxed text-muted">
              Open a real KeeperHub execution ID together with its frozen settlementId and ledgerHash in the Settlement Capsule. FINALTab does not render a
              prewritten success state: it fetches KeeperHub, re-fetches Base Sepolia independently,
              and requires the successful V2 <code className="font-mono text-xs text-paper">SettlementExecuted</code> event from the configured contract with both indexed plan hashes matching.
            </p>
            <Link
              href="/app/proof"
              className="touch-target mt-4 inline-flex items-center rounded-md border border-signal/40 bg-signal/10 px-4 py-2 font-mono text-xs text-signal transition hover:bg-signal/15"
            >
              Open Settlement Capsule →
            </Link>
          </div>
        </section>

        <footer className="mt-16 border-t border-quiet pt-6">
          <p className="font-mono text-[11px] text-faint">
            Source:{" "}
            <a
              href="https://github.com/vaibhav4046/finaltab"
              className="touch-target inline-flex items-center text-muted underline decoration-quiet underline-offset-2 hover:text-paper"
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

# Security policy

FINALTab is hackathon-stage, testnet-only software. Historical V1 runs and one
deliberately minimal V2 run moved Base Sepolia USDC; the V2 proof moved exactly
one atomic unit and retained independent receipt, event, and balance checks.
The system has not been audited and must not be used with mainnet assets or
valuable private keys.

## Reporting a vulnerability

Please do not disclose a vulnerability in a public issue. Email
`vaibhavlalwani26969@gmail.com` with:

- a concise description and expected impact;
- affected commit, route, contract, or package;
- minimal reproduction steps or a proof of concept;
- whether any testnet funds, credentials, or user data may be exposed; and
- a safe way to contact you for follow-up.

Do not include live secrets in the report. Redact API keys, private keys,
cookies, and authorization headers. You should receive an acknowledgement
within 72 hours. A remediation timeline will follow after the report is
validated.

## Supported version

Only the current `main` branch and the live deployment at
<https://finaltab.vercel.app> are supported during the hackathon. Historical
commits and local demo builds are not maintained security releases.

## Security boundaries

- V2 is deployed on Base Sepolia at
  `0x7b58791cEBD9A82F8Ee4E4cF87e7AD1B64A3cCDB`; Sourcify reports exact creation
  and runtime matches. BaseScan-native source publication is not claimed.
- The current product never generates or stores participant private keys.
  Debtors connect the exact external wallet address entered for the tab and sign
  both V2 typed-data payloads themselves.
- Production MCP V2 requires scoped authentication, externally supplied debtor
  signatures, and a wallet-signed short-lived broadcast challenge. Exactly nine
  production tools are present; retired fixed-wallet money tools are absent.
- The London Supabase project is provisioned and its schema security is
  verified; persistence and cross-device identity behavior still must be
  verified against the final deployed application.
- Supabase Auth is the canonical account and RLS subject. Privy is an optional
  custom-JWT wallet bridge: its access and identity tokens are verified as a
  pair and must link to the current Supabase UUID. Privy tokens never become
  settlement/MCP principals, and local development has no implicit all-scope
  identity. Privy dashboard setup remains an external fail-closed release gate;
  see [docs/integrations/privy.md](docs/integrations/privy.md).
- Single-use collaboration invites are issued only in URL fragments. Before an
  email-auth navigation, the browser exchanges the fragment for a 30-minute
  AES-GCM encrypted, HttpOnly, SameSite cookie scoped to `/api/invites`; the raw
  token never enters `next=`, callback URLs, server logs, or browser history.
  Encryption derives a domain-separated key from the server-only
  `FINALTAB_PROOF_SIGNING_SECRET`.
- Durable financial transitions and paid-voice budget reservations are exposed
  only to the server role. Browser sessions are authenticated first, then the
  server passes the exact verified Supabase user ID; missing
  `SUPABASE_SECRET_KEY` fails closed before KeeperHub or a paid provider call.
- The post-promotion cutover also revokes `TRUNCATE`, `REFERENCES`, `TRIGGER`,
  and `MAINTAIN` from browser-facing database roles across `public`; those
  privileges can bypass row policies or mutate schema behavior and are never
  required by the product.
- The first-party UI, REST execution endpoint, and MCP submission tool use one
  service-authored durable submission journal. Fresh work records a successful
  simulation and exact plan/principal/approval binding before KeeperHub. A
  durably accepted replay skips simulation and execution; a prepared recovery
  reuses that recorded simulation and the same deterministic idempotency key,
  subject to a bounded approval expiry. Fresh first-party value movement still
  requires both current database approvals and a valid wallet approval at the
  last pre-broadcast check.
- The first-party Freeze action requires a current, server-attested four-stage
  review. Any upstream receipt, participant, payer, or allocation edit makes the
  prior review stale. `FINALTAB_AGENT_ATTESTATION_SECRET` is server-only and
  authenticates run, event, and bounded audit-memory envelopes; the memory cannot
  change code, prompts, policy, or authorization rules.
- The hosted Supabase measurement is still exactly four applied migrations,
  19 RLS-enabled tables, 45 policies, no anonymous table grants, and 34/34
  indexed foreign keys. Additive migrations `20260811052236`, `20260811064822`,
  `20260811073000`, and `20260811074000` are present in source but unapplied;
  `20260811074500` is intentionally reserved for after candidate promotion. No
  production durability or legacy-write cutover claim is made until the ordered
  migration and tenant-isolation/crash-recovery probes pass.
- Groq and KeeperHub credentials belong only in server-side environment
  variables. `.env*`, proof captures, traces, and videos must be scanned before
  publication.

## Safe-harbor expectations

Good-faith research should stay on Base Sepolia, avoid privacy violations and
service disruption, use the smallest test amount necessary, and stop if it
could affect another person's assets or data. Do not perform denial-of-service
testing, social engineering, credential theft, or automated high-volume calls.

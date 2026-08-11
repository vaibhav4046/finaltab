# Security policy

FINALTab is hackathon-stage, testnet-only software. Historical V1 runs moved
Base Sepolia USDC; the current V2 contract is deployed but has no retained
value-moving proof yet. The system has not been audited and must not be used
with mainnet assets or valuable private keys.

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
- Browser demo keys are disposable testnet identities. Persistence, when
  explicitly enabled, stores those keys in local storage and must never be used
  for valuable accounts.
- Production MCP V2 requires scoped authentication, externally supplied debtor
  signatures, and a wallet-signed short-lived broadcast challenge. Separate
  fixed-wallet `demo_*` tools are testnet-only and disabled by default.
- Supabase migrations exist; persistence and cross-device identity claims must
  be verified against the final deployed configuration.
- Groq and KeeperHub credentials belong only in server-side environment
  variables. `.env*`, proof captures, traces, and videos must be scanned before
  publication.

## Safe-harbor expectations

Good-faith research should stay on Base Sepolia, avoid privacy violations and
service disruption, use the smallest test amount necessary, and stop if it
could affect another person's assets or data. Do not perform denial-of-service
testing, social engineering, credential theft, or automated high-volume calls.

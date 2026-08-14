# ElevenLabs V3 runtime operator

The V3 generator is dry by default. The temporary deployed runtime operator is the only enabled synthesis path. Its preflight mode makes exactly one authenticated `GET /v1/user/subscription`, returns only sanitized aggregate facts, and has no synthesis branch even when quota is sufficient. Generation repeats the same fail-closed quota guard, durably reserves the fixed operation, and permits one complete-script POST without retries.

## Vercel Sensitive-variable boundary

Do **not** use `vercel env run -e production` for this operation when `ELEVENLABS_API_KEY` is a Vercel Sensitive environment variable. `-e production` is valid Vercel CLI syntax, but Sensitive values are non-readable and are not injected into a local child process. This is not a PowerShell, `npm.cmd`, `--environment`, or `--target` problem.

The key remains unreadable inside the Vercel Function. The route requires both independent capabilities before it reads the provider key or the generation journal:

- an existing static bearer principal with `settlements:prepare`; sessions and JWT bearers are rejected;
- a dedicated raw capability from the ignored `proof-output/finaltab-v3-narration-operator-token.local.json` file, sent only as `x-finaltab-v3-narration-token`.

Vercel stores only `FINALTAB_V3_NARRATION_OPERATOR_TOKEN_SHA256`, the 64-character lowercase SHA-256 digest of that second capability. It must never store the raw capability in this variable, and the raw capability must never enter source control, command-line arguments, stdout, stderr, receipts, manifests, or ledgers. This implementation does not create either the capability file or the Vercel variable.

The ignored local capability file contract is:

```json
{
  "version": 1,
  "capability": "<high-entropy raw capability>"
}
```

The route is fixed to George (`JBFqnCBsd6RMkjVDRZzb`), `eleven_multilingual_v2`, `mp3_44100_128`, the locked 1,200-character script hash, and expiry `2026-08-12T08:00:00Z`. All provider requests use `redirect: "error"`; the route cannot follow a response while carrying `xi-api-key`.

After the draft migration and route are separately approved, applied, and deployed—and both ignored local credentials already exist—the local commands are:

```powershell
npm run voice:runtime:preflight
npm run voice:runtime:generate
```

The runner reads both raw credentials only in memory and never prints either one or a response body. Preflight prints only fixed aggregate quota facts. Generation verifies the returned audio bounds and SHA-256, then atomically reconciles the canonical raw MP3, sanitized ledger, manifest, and ignored receipt. A crash-safe replay retrieves the durable stored artifact without a second provider POST.

The legacy direct `generate-voiceover.mjs --execute` path is retired and always fails closed. There are no retries, redirects, upgrades, credit purchases, quota extensions, overage operations, deployments, migration applies, or provider calls in this implementation step.

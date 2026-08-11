# Contributing to FINALTab

Thanks for helping make onchain settlement safer and easier to verify. This is
a pnpm monorepo containing the web app, deterministic money engine, vision
boundary, KeeperHub client, proof CLI, and Hardhat contracts.

## Before you start

- Use Node.js 22 or newer and pnpm 10.33.2.
- Work from a current branch based on `main`.
- Never commit API keys, wallet keys, seed phrases, cookies, proof captures, or
  `.env` files.
- Use Base Sepolia only. Do not test this repository with mainnet funds.
- Read [SECURITY.md](SECURITY.md) before reporting a vulnerability.

## Local setup

```bash
corepack enable
corepack prepare pnpm@10.33.2 --activate
pnpm install --frozen-lockfile
cp .env.example apps/web/.env.local
```

Leave optional credentials blank unless the change needs the corresponding
live integration. Unit tests use fixtures; the one live Groq test skips without
`GROQ_API_KEY`.

Run the web app with:

```bash
pnpm --dir apps/web dev
```

## Required checks

Before opening a pull request, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:contracts
pnpm build
pnpm test:e2e
```

The E2E suite builds and starts the production web app automatically. It is a
read-only smoke suite: it must not broadcast a settlement or consume external
provider credits.

## Change guidelines

- Keep all money in integer minor units. Do not introduce floating-point money
  arithmetic.
- LLM output is a proposal. Deterministic validation and reconciliation remain
  authoritative.
- A transaction hash is not settlement proof. Only a successful,
  chain-verified receipt may become `VERIFIED_SETTLED`.
- Preserve simulate-before-execute behavior and explicit confirmation for
  money-moving MCP tools.
- Add or update tests for every behavior change, including honest failure
  states.
- Do not widen a product claim beyond the evidence committed with it.

## Pull requests

Describe the problem, the chosen approach, risk or rollback considerations,
and the exact checks run. Link retained proof for live-integration changes, but
redact secrets and personal data. Keep unrelated formatting or generated-file
changes out of the pull request.

By contributing, you agree that your contribution is licensed under the MIT
License in [LICENSE](LICENSE).

# KeeperHub CLI contribution — PR draft (NOT YET PUSHED)

Status: code complete + committed locally. **Waiting for your approval before any public push or PR.**

- Repo clone: `D:\project\keeperhub-cli` (KeeperHub/cli, upstream HEAD 395beb7 = v0.14.0)
- Branch: `feat/execute-status-require-verified`
- Commit: `c4602cf`
- To ship: fork KeeperHub/cli under your GitHub account, push the branch, open PR with the body below.

## Verification evidence (real, this machine)

- `go vet ./cmd/execute/` clean; gofmt clean on changed files (repo checkout is CRLF via autocrlf, upstream files untouched).
- `go test ./cmd/execute/` → `ok github.com/keeperhub/cli/cmd/execute 14.803s` (all 4 pre-existing tests + 7 new tests pass).
- Full `go test ./...` → 27 packages ok; the only failures are the 8 pre-existing agentic-wallet/doctor failures that also fail on a clean clone on Windows (disclosed below, not touched by this change).
- Binary built from `./cmd/kh` and `kh execute status --help` shows the new flags.

---

## PR title

feat(execute): add --require-verified and --timeout to execute status

## PR body

### Problem

`kh execute status` treats `status=completed` as final proof of success. But a completed execution without chain-verified receipts only proves the transaction was **submitted**, not that it **landed**. Agents and CI scripts that gate on this command can proceed on unproven state.

Separately, `kh execute status --watch` has no deadline: if an execution never reaches a terminal state, the command polls forever. (`kh execute transfer --wait` already has a `--timeout` for exactly this reason; `status --watch` does not.)

Related: #49 asks for better executionId → status lookup ergonomics for agent workflows; this PR makes the existing lookup safe to gate on.

### Changes

- Parse `receipts[]` from `GET /api/execute/{id}/status` (`hash`, `chainId`, `verified`, `receiptStatus`, `blockNumber`, `gasUsed`, `verifiedAt`) and render each receipt in the status table.
- New `--require-verified` flag: exit non-zero unless the execution is `completed` AND at least one receipt exists AND every receipt has `verified=true` with `receiptStatus="success"`. Fails closed on `reverted`, `not_found`, `timeout`, and `safe_inner_failure`.
- New `--timeout` flag (default 5m) for `--watch`, mirroring the deadline pattern in `pollExecStatus` used by `transfer --wait`.
- Back-compat: without `--require-verified`, output and exit behavior are unchanged (receipts are shown when present).

### Why fail-closed

A `transactionHash` proves submission; a verified receipt proves landing. For agent pipelines that chain onchain steps (`kh ex st <id> --watch --require-verified && ./next-step.sh`), the safe default for the strict flag is: no proof → non-zero exit.

### Tests

7 new cases in `cmd/execute/status_verified_test.go` (httptest fake server, same idiom as the existing status tests):

1. completed + verified success receipt + `--require-verified` → exit 0, receipt rendered
2. completed + no receipts + `--require-verified` → non-zero, "no receipts"
3. completed + `verified=false` receipt → non-zero, offending hash in error
4. completed + receiptStatus in {reverted, not_found, timeout, safe_inner_failure} → non-zero each (subtests)
5. completed + no receipts WITHOUT the flag → exit 0 (back-compat)
6. `--watch --require-verified` → polls pending → completed+verified → exit 0
7. `--watch --timeout 100ms` against a never-terminal execution → non-zero with "timeout"

`go vet` clean, `gofmt` clean, `go test ./cmd/execute/` green.

Note: on Windows, 8 pre-existing agentic-wallet/doctor tests fail on a clean clone of main (appears to be a HOME vs USERPROFILE issue in test setup); untouched by this PR.

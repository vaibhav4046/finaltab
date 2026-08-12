# KeeperHub CLI contribution — historical initial draft

> **Superseded.** This file is retained only to document the original proposal.
> The live source of truth is [KeeperHub/cli PR #95](https://github.com/KeeperHub/cli/pull/95).

The current pull request is **open and unmerged**. Its title is
`feat(execute): require chain-verified receipts in status`, and its current
two-commit patch adds only `--require-verified`. The initially proposed
`--timeout` option was removed before the current review state.

The contribution makes `kh execute status` fail closed for agent and CI callers
that opt into verified-receipt enforcement: a completed execution without a
verified successful chain receipt does not satisfy the stricter contract.

Current evidence and submission wording live in:

- [README.md](../README.md#keeperhub-onboarding-contribution)
- [docs/release/status.md](release/status.md)
- [docs/release/evidence.json](release/evidence.json)

Do not copy scope, counts, local paths, or test results from earlier revisions
of this draft into release material.

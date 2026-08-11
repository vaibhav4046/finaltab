# FINALTab — submission entrypoint

This file intentionally contains no duplicate submission copy. Duplicated
claims previously drifted across several documents, including conflicting
92.7-second and 101.64-second video metadata.

- Canonical submission copy: [docs/submission.md](docs/submission.md)
- Source-of-truth status: [docs/release/status.md](docs/release/status.md)
- Pre-submit checklist:
  [docs/release/SUBMISSION_CHECKLIST.md](docs/release/SUBMISSION_CHECKLIST.md)
- Evidence labels: [docs/release/truth-snapshot.md](docs/release/truth-snapshot.md)

Current gates: **the post-promotion Supabase financial cutover, final
deployment/provider probe, unified nine-tool MCP capture, final 4K/60 video and
public URL, and human submission are pending**. The V2
one-atomic-unit settlement, verified 29-table RLS additive Supabase schema,
durable voice quotas/spend reservations, and
sensitive provider configuration are now proven. Main commit
`b084497` has a green two-job CI baseline and a 13/13 protected production
probe; newer submission commits must preserve those gates. The V2 deployment
transaction alone does not satisfy the product-settlement proof gate.

The final local suite is 387 passing with one provider-gated vision check
skipped, and the production build generated 33/33 pages. These figures must be
reproduced from the submitted commit before they become release evidence.

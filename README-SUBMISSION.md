# FINALTab — submission entrypoint

This file intentionally contains no duplicate submission copy. Duplicated
claims previously drifted across several documents, including conflicting
92.7-second and 101.64-second video metadata.

- Canonical submission copy: [docs/submission.md](docs/submission.md)
- Source-of-truth status: [docs/release/status.md](docs/release/status.md)
- Pre-submit checklist:
  [docs/release/SUBMISSION_CHECKLIST.md](docs/release/SUBMISSION_CHECKLIST.md)
- Evidence labels: [docs/release/truth-snapshot.md](docs/release/truth-snapshot.md)

Current gates: **V2 USDC settlement proof, final video/public URL, verified
Supabase provisioning, durably guarded production voice, and human submission
are pending**. Main commit
`b084497` has a green two-job CI baseline and a 13/13 protected production
probe; newer submission commits must preserve those gates. The V2 deployment
transaction alone does not satisfy the product-settlement proof gate.

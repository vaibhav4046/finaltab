# FINALTab judge Q&A

1. **What is FINALTab in one sentence?**
   A proof-carrying settlement rail that turns shared receipts into exact,
   externally approved USDC payments through KeeperHub.

2. **Isn’t this just Splitwise onchain?**
   Traditional splitters primarily track obligations. FINALTab adds deterministic
   allocation, external-wallet consent, atomic settlement, KeeperHub execution,
   and independently verified proof.

3. **Why use a blockchain?**
   It gives every participant a common settlement record and programmable
   consent. FINALTab verifies the exact event and balance conservation—not merely
   the existence of a transaction hash.

4. **Why KeeperHub?**
   Agent reasoning and reliable transaction landing are different problems.
   KeeperHub supplies the execution record and reliability layer; FINALTab
   supplies receipt logic, consent, durability, and independent verification.

5. **What is genuinely live?**
   The application, GitHub OAuth, durable tab creation/read, authenticated
   nine-tool non-value MCP surface, V2 deployment, source match, hosted RLS
   schema, and retained KeeperHub V2 settlement. Mainnet, MCP value submission,
   and the interactive voice lifecycle are not claimed live.

6. **Was the retained settlement executed through MCP?**
   No. It was a separate explicitly authorized simulate-then-single-broadcast
   runner through KeeperHub. The filmed MCP session hard-stopped before any
   signature, simulation, submission, or broadcast.

7. **What does the filmed MCP test prove?**
   Authenticated initialization, the exact nine-tool surface, complex allocation,
   V2 settlement preparation, and approval-challenge creation. It is a non-value
   test.

8. **Why move only one atomic USDC unit?**
   It exercises the contract, signatures, KeeperHub execution, indexed event,
   and conservation checks while minimizing testnet risk. It proves mechanics,
   not scale, adoption, or mainnet readiness.

9. **Where is AI actually used?**
   AI interprets receipt intent and supports bounded review. Integer allocation,
   netting, hashing, consent validation, and settlement verification are
   deterministic.

10. **Is it autonomous if a human approves broadcasting?**
    Yes, intentionally bounded. The agent can interpret, prepare, review,
    simulate, and prove; people and external wallets retain authority over value.

11. **How do you guarantee exact totals?**
    Amounts become integer minor units, and largest-remainder allocation
    distributes residual units deterministically until shares equal the receipt
    total exactly.

12. **What happens if someone edits after review?**
    Upstream changes invalidate the four-stage review. Freeze produces new
    canonical hashes, so prior consent cannot authorize a changed plan.

13. **Who controls participant keys?**
    Participants sign through external wallets. FINALTab does not hold arbitrary
    participant private keys.

14. **How do retries avoid duplicate execution?**
    UI, REST, and MCP converge on a durable submission-intent journal with
    deterministic idempotency. Accepted executions are returned rather than
    rebroadcast. Cross-channel recovery remains source/test/schema-proven until
    every production recovery path is separately exercised.

15. **What if KeeperHub says completed but the transaction failed?**
    FINALTab fails closed. It requires a verified successful KeeperHub receipt
    and independently fetches the chain receipt and exact indexed event bound to
    the frozen settlement.

16. **What makes the contract safe?**
    Dual signatures bind token authorization and the full settlement plan.
    Invalid signatures, replay, expiry, mutation, or conservation failure revert
    the batch. The contract is source-matched and tested; no external audit claim
    is made.

17. **How does it scale?**
    Deterministic netting reduces a group to at most `n−1` transfers, followed by
    one atomic batch. The greedy net is not claimed globally minimal, and
    production-scale gas benchmarking remains future work.

18. **What is the voice status?**
    The optional microphone/readback path is deployed and configured but its
    complete provider lifecycle is not live-proven. The film uses local Kokoro
    narration; voice never has settlement authority.

19. **What did PR #95 contribute?**
    The fail-closed `--require-verified` option, so KeeperHub CLI status can reject
    executions lacking a verified successful receipt. It is open and unmerged.

20. **What comes next?**
    Exercise the complete wallet-approved MCP production trace, commission an
    external security review, benchmark gas at larger group sizes, and graduate
    through a controlled mainnet pilot.

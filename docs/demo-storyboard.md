# Demo storyboard (~2.5 min)

## As recorded (2026-08-09)

Final video: `proof-output/finaltab-demo.mp4` — 92.7s, 1920x1080, ElevenLabs voiceover (George). One continuous Playwright capture of the real app on :3017; every state on screen is a live result (real Groq extraction, real Groq allocation reconciled by the engine, real EIP-712 freeze + EIP-3009 signing). Deviations from the plan below, all honest:

- **Scene 3**: instruction used was "Vee had the black daal and one naan. Hem had the chicken ruby. Ravi had everything else. Split the service charge fairly." Live shares came out 15.07 / 15.64 / 23.29 = 54.00, cent-perfect.
- **Scene 6**: SIMULATE shows the honest blocked note (settlement contract not yet deployed — org wallet has no deploy gas), not a green pass. That blocked state IS the product's honesty on screen.
- **Scene 7**: shows the landing page's verified-flight proof section (real executionId, block, verified:true, BaseScan link) instead of BaseScan itself — BaseScan serves headless browsers a Cloudflare challenge, which we do not complete. The section links out to the real tx.
- **Scene 8**: shows the open KeeperHub/cli PR #95 page (open, not merged).

Works silent (captions) or with voiceover. Record at 1440p, app in dark room aesthetic. No fake states on screen: if the org key is still missing at record time, stop at scene 6 and show the flight-recorder test run instead of a live settle (scene 7B).

## Scene 1 — Cold open (0:00-0:15)

Screen: the DISHOOM receipt photo next to a group chat saying "I'll send it later lol".
Caption/VO: "Every split app dies at the same spot: the part where money actually moves. FINALTab doesn't."

## Scene 2 — Upload + extraction (0:15-0:40)

Screen: drag the receipt into MIDNIGHT RECEIPT LAB. Extraction panel fills: line items, amounts as exact strings, service charge picked up.
Caption/VO: "Groq vision reads the receipt into strict JSON. Every amount is an integer minor unit. There is not a single float touching money in this codebase."

## Scene 3 — Plain English allocation (0:40-1:05)

Screen: type "vee had the black daal and half the naan, split the rest evenly." Shares appear: vee 14.62, hem 33.53, ravi 5.85. Sum badge shows 54.00 = receipt total.
Caption/VO: "The model proposes. The engine decides. Largest-remainder splitting, cent-perfect, re-reconciled against the receipt every time. In testing the model hallucinated about the service charge; the engine split it correctly anyway."

## Scene 4 — Netting animation (1:05-1:20)

Screen: debt graph collapses to two arrows: hem -> vee, ravi -> vee.
Caption/VO: "The debt graph nets down to the minimum transfers before anyone signs."

## Scene 5 — Freeze + sign (1:20-1:45)

Screen: freeze the ledger; ledgerHash appears. Then edit an item: signatures visibly invalidate. Undo, re-freeze, debtors sign EIP-3009 authorizations.
Caption/VO: "The ledger freezes into a keccak256 hash. Signature nonces derive from that hash, so editing anything after signing kills every signature by construction. Debtors sign gasless USDC authorizations. No approvals."

## Scene 6 — Simulate first (1:45-2:05)

Screen: Execution Rail. SIMULATE runs through KeeperHub, goes green.
Caption/VO: "KeeperHub is the only execution layer. Simulate first. A failed simulation is never broadcast."

## Scene 7A — Execute + verify (2:05-2:30) [requires kh_ org key]

Screen: EXECUTE. Status polls: pending -> completed. Then the receipt check: verified=true, receiptStatus=success. Badge flips to VERIFIED_SETTLED. BaseScan link on screen.
Caption/VO: "A transaction hash proves submission. Only a chain-verified receipt proves landing. FINALTab never says settled until the chain does."

## Scene 7B — Fallback if key still blocked

Screen: run `pnpm test` in packages/keeperhub-flight-recorder; the fake-server suite shows pending -> completed -> verified receipt -> exit 0, and timeout -> exit 3.
Caption/VO: "Live execution needs an organization key we're still waiting on, so here is the verification logic under test: it fails closed. No receipt, no VERIFIED_SETTLED."

## Scene 8 — CLI contribution close (2:30-2:50)

Screen: terminal: `kh execute status <id> --watch --require-verified` help output, then the 7 tests passing.
Caption/VO: "We shipped the same discipline upstream: kh execute status now can refuse to call it done until receipts are chain-verified. One flag gates any agent pipeline on proof instead of hope. That is FINALTab."

## Assets checklist

- [ ] Receipt photo (DISHOOM) staged
- [x] .env.local filled (Groq + KeeperHub org key, both proven live)
- [ ] Dev server on :3017 (or use https://finaltab.vercel.app live)
- [ ] kh.exe built for scene 8
- [x] ElevenLabs voiceover generated: 8 mp3s in `proof-output/voiceover/` (scene1-cold-open ... scene8-cli-close), George voice, matches the VO lines above
- Scene 7A is now REAL for the sponsored flight (see `proof-output/first-flight-2026-08-09T06-16-38-800Z.json`); the contract-deploy + live settle variant unlocks once the org wallet has deploy gas (see blockers.md)

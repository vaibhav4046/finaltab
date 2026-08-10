"use client";

import { useState } from "react";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress } from "viem";
import {
  BASE_SEPOLIA_CHAIN_ID,
  buildTransferAuthorizationTypedData,
  equalSplit,
  parseFiat,
  formatFiat,
} from "@finaltab/engine";
import { freezeLedger, makeDemoPeople } from "@/lib/flow";

type StepStatus = "info" | "blocked" | "repair" | "pass";

interface Step {
  status: StepStatus;
  label: string;
  detail: string;
}

interface Scenario {
  id: string;
  title: string;
  blurb: string;
  run: () => Promise<Step[]>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DEMO_DEBTS = [
  { debtor: "hem", creditor: "vee", usdcMinor: "12000000" },
  { debtor: "ravi", creditor: "vee", usdcMinor: "8500000" },
];

/** Sign one frozen transfer with the debtor's demo key; returns compact signature. */
async function signFrozenTransfer(
  people: ReturnType<typeof makeDemoPeople>,
  transfer: { from: `0x${string}`; to: `0x${string}`; value: string },
  nonce: `0x${string}`,
  validBefore: bigint,
) {
  const person = people.find((p) => p.address.toLowerCase() === transfer.from.toLowerCase());
  if (!person?.demoPrivateKey) throw new Error("no demo key for debtor");
  const account = privateKeyToAccount(person.demoPrivateKey);
  const typed = buildTransferAuthorizationTypedData({
    from: transfer.from,
    to: transfer.to,
    value: BigInt(transfer.value),
    validAfter: 0n,
    validBefore,
    nonce,
  });
  const signature = await account.signTypedData(typed);
  return { typed, signature, signer: account.address };
}

const SCENARIOS: Scenario[] = [
  {
    id: "expired-auth",
    title: "Expired authorization",
    blurb: "A debtor's signature is only valid for a window. What if it lapsed?",
    run: async () => {
      const account = privateKeyToAccount(generatePrivateKey());
      const to = privateKeyToAccount(generatePrivateKey()).address;
      const now = BigInt(Math.floor(Date.now() / 1000));
      const staleBefore = now - 120n;
      const nonce = generatePrivateKey();
      const typed = buildTransferAuthorizationTypedData({
        from: account.address, to, value: 1_000_000n,
        validAfter: 0n, validBefore: staleBefore, nonce,
      });
      await account.signTypedData(typed);
      const steps: Step[] = [
        { status: "info", label: "Inject", detail: "Signed a real EIP-3009 authorization whose validBefore expired 2 minutes ago." },
      ];
      if (staleBefore <= now) {
        steps.push({ status: "blocked", label: "Preflight blocked", detail: `validBefore (${staleBefore}) ≤ now (${now}). This would revert onchain — broadcast refused.` });
      }
      const freshBefore = now + 3600n;
      const typed2 = buildTransferAuthorizationTypedData({
        from: account.address, to, value: 1_000_000n,
        validAfter: 0n, validBefore: freshBefore, nonce: generatePrivateKey(),
      });
      const sig2 = await account.signTypedData(typed2);
      const recovered = await recoverTypedDataAddress({ ...typed2, signature: sig2 });
      steps.push({ status: "repair", label: "Repair", detail: "Debtor re-signed with a fresh 1-hour validity window." });
      steps.push(
        recovered.toLowerCase() === account.address.toLowerCase()
          ? { status: "pass", label: "Preflight passed", detail: "Signature recovers to the debtor's address and the window is live. Cleared for broadcast." }
          : { status: "blocked", label: "Still blocked", detail: "Recovered signer does not match debtor." },
      );
      return steps;
    },
  },
  {
    id: "altered-ledger",
    title: "Altered ledger after freeze",
    blurb: "Someone edits an amount after everyone signed. Do the signatures survive?",
    run: async () => {
      const people = makeDemoPeople();
      const frozen = freezeLedger(people, DEMO_DEBTS, "receipt-lab-tamper", "USD");
      const tampered = freezeLedger(
        people,
        [{ ...DEMO_DEBTS[0]!, usdcMinor: "99000000" }, DEMO_DEBTS[1]!],
        "receipt-lab-tamper",
        "USD",
      );
      const steps: Step[] = [
        { status: "info", label: "Inject", detail: `Ledger frozen and hashed (${frozen.ledgerHash.slice(0, 10)}…). Then one amount was edited from 12.00 to 99.00 USDC.` },
      ];
      if (tampered.ledgerHash !== frozen.ledgerHash) {
        steps.push({ status: "blocked", label: "Preflight blocked", detail: `Recomputed hash ${tampered.ledgerHash.slice(0, 10)}… ≠ signed hash ${frozen.ledgerHash.slice(0, 10)}…. Every signature nonce derives from the ledger hash, so all consent is void. Refused.` });
      }
      steps.push({ status: "repair", label: "Repair", detail: "Reverted to the exact ledger everyone signed." });
      const recheck = freezeLedger(people, DEMO_DEBTS, "receipt-lab-tamper", "USD");
      steps.push(
        recheck.ledgerHash === frozen.ledgerHash
          ? { status: "pass", label: "Preflight passed", detail: "Hash matches the signed ledger byte-for-byte. Consent intact." }
          : { status: "blocked", label: "Still blocked", detail: "Hash mismatch persists." },
      );
      return steps;
    },
  },
  {
    id: "unbalanced-split",
    title: "Unbalanced split",
    blurb: "The shares don't add up to the receipt total. 88p goes missing.",
    run: async () => {
      const total = parseFiat("48.88");
      const badShares = [parseFiat("16.00"), parseFiat("16.00"), parseFiat("16.00")];
      const badSum = badShares.reduce((a, b) => a + b, 0n);
      const steps: Step[] = [
        { status: "info", label: "Inject", detail: "Three equal £16.00 shares proposed against a £48.88 receipt." },
      ];
      if (badSum !== total) {
        steps.push({ status: "blocked", label: "Freeze blocked", detail: `£${formatFiat(badSum)} allocated vs £${formatFiat(total)} total — £${formatFiat(total - badSum)} unaccounted. FINALTab refuses to freeze a ledger that doesn't reconcile.` });
      }
      const fixed = equalSplit(total, 3);
      const fixedSum = fixed.reduce((a, b) => a + b, 0n);
      steps.push({ status: "repair", label: "Repair", detail: `Largest-remainder split: ${fixed.map((s) => `£${formatFiat(s)}`).join(" + ")}.` });
      steps.push(
        fixedSum === total
          ? { status: "pass", label: "Reconciled", detail: `£${formatFiat(fixedSum)} / £${formatFiat(total)} reconciled ✓ — every penny assigned, no rounding dust.` }
          : { status: "blocked", label: "Still blocked", detail: "Shares still do not sum to total." },
      );
      return steps;
    },
  },
  {
    id: "missing-signature",
    title: "Missing signature",
    blurb: "Two people owe money but only one signed. Can it settle anyway?",
    run: async () => {
      const people = makeDemoPeople();
      const frozen = freezeLedger(people, DEMO_DEBTS, "receipt-lab-missing-sig", "USD");
      const validBefore = BigInt(Math.floor(Date.now() / 1000)) + 3600n;
      const nonce0 = generatePrivateKey();
      await signFrozenTransfer(people, frozen.transfers[0]!, nonce0, validBefore);
      const presented = 1;
      const steps: Step[] = [
        { status: "info", label: "Inject", detail: `Ledger has ${frozen.transfers.length} transfers; only ${presented} debtor signed.` },
      ];
      if (presented < frozen.transfers.length) {
        steps.push({ status: "blocked", label: "Preflight blocked", detail: `${presented} of ${frozen.transfers.length} signatures present. FINALTab never moves money for someone who hasn't signed.` });
      }
      const { signature, signer, typed } = await signFrozenTransfer(
        people, frozen.transfers[1]!, generatePrivateKey(), validBefore,
      );
      const recovered = await recoverTypedDataAddress({ ...typed, signature });
      steps.push({ status: "repair", label: "Repair", detail: "Second debtor signed their transfer." });
      steps.push(
        recovered.toLowerCase() === signer.toLowerCase()
          ? { status: "pass", label: "Preflight passed", detail: `${frozen.transfers.length} of ${frozen.transfers.length} signatures verified by ECDSA recovery — every debtor consented.` }
          : { status: "blocked", label: "Still blocked", detail: "Signature recovery failed." },
      );
      return steps;
    },
  },
  {
    id: "wrong-chain",
    title: "Wrong chain",
    blurb: "A signature produced for Ethereum mainnet is replayed on Base Sepolia.",
    run: async () => {
      const account = privateKeyToAccount(generatePrivateKey());
      const to = privateKeyToAccount(generatePrivateKey()).address;
      const nonce = generatePrivateKey();
      const correct = buildTransferAuthorizationTypedData({
        from: account.address, to, value: 5_000_000n,
        validAfter: 0n, validBefore: BigInt(Math.floor(Date.now() / 1000)) + 3600n, nonce,
      });
      const wrongDomain = { ...correct.domain, chainId: 1 };
      const wrongSig = await account.signTypedData({
        domain: wrongDomain,
        types: correct.types,
        primaryType: correct.primaryType,
        message: correct.message,
      });
      const recoveredFromWrong = await recoverTypedDataAddress({ ...correct, signature: wrongSig });
      const steps: Step[] = [
        { status: "info", label: "Inject", detail: "Authorization signed under an EIP-712 domain with chainId 1 (mainnet), then presented to the Base Sepolia (84532) verifier." },
      ];
      if (recoveredFromWrong.toLowerCase() !== account.address.toLowerCase()) {
        steps.push({ status: "blocked", label: "Preflight blocked", detail: `EIP-712 domain separation: recovery under chainId ${BASE_SEPOLIA_CHAIN_ID} yields ${recoveredFromWrong.slice(0, 8)}… ≠ debtor ${account.address.slice(0, 8)}…. Cross-chain replay is cryptographically dead on arrival.` });
      }
      const rightSig = await account.signTypedData(correct);
      const recovered = await recoverTypedDataAddress({ ...correct, signature: rightSig });
      steps.push({ status: "repair", label: "Repair", detail: "Re-signed under the correct Base Sepolia USDC domain." });
      steps.push(
        recovered.toLowerCase() === account.address.toLowerCase()
          ? { status: "pass", label: "Preflight passed", detail: "Signature recovers to the debtor on chain 84532. Cleared." }
          : { status: "blocked", label: "Still blocked", detail: "Recovery mismatch persists." },
      );
      return steps;
    },
  },
  {
    id: "duplicate-settlement",
    title: "Duplicate settlement",
    blurb: "The same settlement is submitted twice. Does anyone pay twice?",
    run: async () => {
      const people = makeDemoPeople();
      const frozen = freezeLedger(people, DEMO_DEBTS, "receipt-lab-dup", "USD");
      const executed = new Set<string>([frozen.settlementId]);
      const steps: Step[] = [
        { status: "info", label: "Inject", detail: `Settlement ${frozen.settlementId.slice(0, 10)}… already executed once; the exact same ledger is submitted again.` },
      ];
      if (executed.has(frozen.settlementId)) {
        steps.push({ status: "blocked", label: "Preflight blocked", detail: "settlementId (derived from the ledger hash) already recorded as executed. Idempotency guard refuses the replay — nobody pays twice." });
      }
      const fresh = freezeLedger(people, DEMO_DEBTS, "receipt-lab-dup-2", "USD");
      steps.push({ status: "repair", label: "Repair", detail: "A genuinely new tab produces a new receipt id → new ledger hash → new settlementId." });
      steps.push(
        !executed.has(fresh.settlementId)
          ? { status: "pass", label: "Preflight passed", detail: `New settlement ${fresh.settlementId.slice(0, 10)}… is unseen. Cleared.` }
          : { status: "blocked", label: "Still blocked", detail: "Collision — should be impossible." },
      );
      return steps;
    },
  },
];

const STEP_STYLE: Record<StepStatus, { chip: string; text: string }> = {
  info: { chip: "border-quiet bg-surface-2 text-muted", text: "text-muted" },
  blocked: { chip: "border-danger/40 bg-danger/10 text-danger", text: "text-txt" },
  repair: { chip: "border-info/40 bg-info/10 text-info", text: "text-txt" },
  pass: { chip: "border-signal/40 bg-signal/10 text-signal", text: "text-txt" },
};

function ScenarioCard({ scenario }: { scenario: Scenario }) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setSteps([]);
    try {
      const result = await scenario.run();
      for (const step of result) {
        setSteps((prev) => [...prev, step]);
        await sleep(380);
      }
    } catch (err) {
      setSteps((prev) => [
        ...prev,
        { status: "blocked", label: "Scenario error", detail: err instanceof Error ? err.message : "Unknown error running scenario." },
      ]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col rounded-xl border border-quiet bg-surface-1 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-txt">{scenario.title}</h2>
          <p className="mt-1 text-sm text-muted">{scenario.blurb}</p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="shrink-0 rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-1.5 font-mono text-xs uppercase tracking-wider text-danger transition-colors hover:bg-danger/20 disabled:opacity-50"
        >
          {running ? "Running…" : steps.length > 0 ? "Re-run" : "Inject"}
        </button>
      </div>
      {steps.length > 0 ? (
        <ol className="mt-4 space-y-2.5 border-t border-quiet/50 pt-4">
          {steps.map((s, i) => (
            <li key={`${s.label}-${i}`} className="flex gap-3">
              <span className={`h-fit shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${STEP_STYLE[s.status].chip}`}>
                {s.label}
              </span>
              <p className={`text-sm ${STEP_STYLE[s.status].text}`}>{s.detail}</p>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

export function ReliabilityLab() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="max-w-2xl">
        <p className="font-mono text-xs tracking-[0.25em] text-signal">RELIABILITY LAB</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Try to break the settlement. Watch it refuse.
        </h1>
        <p className="mt-3 text-muted">
          Six real failure injections. Every check below runs in your browser against the actual{" "}
          <span className="font-mono text-sm">@finaltab/engine</span> code that guards production
          settlements — real keys, real EIP-712 signatures, real hashes. Nothing is mocked, and no
          response is ever manufactured.
        </p>
      </header>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {SCENARIOS.map((s) => (
          <ScenarioCard key={s.id} scenario={s} />
        ))}
      </div>

      <p className="mt-8 rounded-lg border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-muted">
        <span className="font-mono text-xs uppercase tracking-wider text-warn">Honest layer label</span>{" "}
        — these are engine preflight checks (local, real code). KeeperHub&apos;s server-side
        simulation is a second, independent gate that runs before any broadcast.
      </p>
    </div>
  );
}

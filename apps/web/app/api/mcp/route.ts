import { createMcpHandler } from "mcp-handler";
import { z } from "zod4";
import {
  parseFiat,
  formatFiat,
  equalSplit,
  largestRemainderSplit,
  nettedTransfers,
  sum,
} from "@finaltab/engine";
import { classifyExecution, KeeperHubError, SimulationRevertError, deriveIdempotencyKey } from "@finaltab/keeperhub";
import { BASE_SEPOLIA_CHAIN_ID } from "@finaltab/engine";
import { keeperHubClient, keeperHubDetail } from "@/lib/server/clients";
import { SettleBodySchema, settleContractCall, settlementContractAddress } from "@/lib/server/settlement";
import {
  AGENT_SIGNERS,
  resolveAgentSigners,
  prepareAgentSettlement,
  signPreparedTransfers,
  agentChainSnapshot,
  formatUsdcMinor,
  type AgentSignerId,
} from "@/lib/server/agentSettlement";

export const runtime = "nodejs";
export const maxDuration = 60;

// FINALTab over MCP: the same deterministic engine the web lab uses, exposed
// so agents (Claude, or anything MCP-capable) can request cent-perfect splits.
// Models propose; this engine decides. No tool here ever fakes a settlement —
// settlement_status reports the fail-closed verdict straight from KeeperHub.

const amount = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "decimal string with at most 2 decimal places, e.g. \"54.00\"");

const participantId = z.string().min(1).max(64);

function ok(structured: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}

function fail(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

const agentId = z.enum(["vee", "hem", "ravi"]);

const agentDebts = z
  .array(
    z.object({
      debtor: agentId.describe("Who owes"),
      creditor: agentId.describe("Who is owed"),
      amountUsd: amount.describe("What debtor owes creditor in USD, e.g. \"4.20\""),
    }),
  )
  .min(1)
  .max(20)
  .describe("Pairwise debts between the demo agents");

/**
 * Resolve the demo signer wallets or explain why money tools are unavailable.
 * Key material stays inside agentSettlement.ts; only PRESENT/MISSING/MALFORMED
 * status ever crosses this boundary.
 */
function requireSigners() {
  const { accounts, status } = resolveAgentSigners();
  if (!accounts) {
    return {
      accounts: null,
      signers: null,
      failure: fail(
        `agent signer keys unavailable: ${AGENT_SIGNERS.map((s) => `${s.id}=${status[s.id]}`).join(", ")}. ` +
          "Money tools need all three FINALTAB_AGENT_KEY_* env vars on the server. " +
          "Read/compute tools (split_equal, split_weighted, net_debts, settlement_status) still work.",
      ),
    };
  }
  const signers = AGENT_SIGNERS.map((s) => ({
    id: s.id,
    name: s.name,
    address: accounts.get(s.id)!.address,
  }));
  return { accounts, signers, failure: null };
}

function addressById(signers: Array<{ id: string; address: `0x${string}` }>) {
  return Object.fromEntries(signers.map((s) => [s.id, s.address])) as Record<
    AgentSignerId,
    `0x${string}`
  >;
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "split_equal",
      {
        title: "Split a total equally",
        description:
          "Split a fiat total equally between people using largest-remainder allocation. " +
          "Shares always sum to the total exactly — no float drift, ever. " +
          "Amounts are decimal strings (\"54.00\"); money is integer minor units internally.",
        inputSchema: {
          total: amount.describe("Receipt total, e.g. \"54.00\""),
          people: z.array(participantId).min(1).max(50).describe("Participant names/ids"),
        },
      },
      async ({ total, people }) => {
        try {
          const totalMinor = parseFiat(total);
          const shares = equalSplit(totalMinor, people.length);
          return ok({
            shares: people.map((id, i) => ({ id, share: formatFiat(shares[i]!) })),
            total: formatFiat(totalMinor),
            sumsToTotal: sum(shares) === totalMinor,
          });
        } catch (e) {
          return fail(e instanceof Error ? e.message : "split failed");
        }
      },
    );

    server.registerTool(
      "split_weighted",
      {
        title: "Split a total by weights",
        description:
          "Split a fiat total across participants proportionally to integer weights " +
          "(e.g. who ate what), using largest-remainder allocation. Shares always sum " +
          "to the total exactly.",
        inputSchema: {
          total: amount.describe("Receipt total, e.g. \"54.00\""),
          entries: z
            .array(z.object({ id: participantId, weight: z.number().int().min(0).max(1_000_000) }))
            .min(1)
            .max(50)
            .describe("Participant weights; at least one must be > 0"),
        },
      },
      async ({ total, entries }) => {
        try {
          const totalMinor = parseFiat(total);
          const shares = largestRemainderSplit(
            totalMinor,
            entries.map((e) => BigInt(e.weight)),
          );
          return ok({
            shares: entries.map((e, i) => ({ id: e.id, share: formatFiat(shares[i]!) })),
            total: formatFiat(totalMinor),
            sumsToTotal: sum(shares) === totalMinor,
          });
        } catch (e) {
          return fail(e instanceof Error ? e.message : "split failed");
        }
      },
    );

    server.registerTool(
      "net_debts",
      {
        title: "Net a debt graph",
        description:
          "Collapse pairwise debts into the minimum set of transfers (at most n-1). " +
          "Deterministic greedy netting with a conservation invariant: the output " +
          "moves exactly as much money as the input.",
        inputSchema: {
          debts: z
            .array(
              z.object({
                debtor: participantId,
                creditor: participantId,
                amount: amount.describe("What debtor owes creditor, e.g. \"18.00\""),
              }),
            )
            .min(1)
            .max(200),
        },
      },
      async ({ debts }) => {
        try {
          const transfers = nettedTransfers(
            debts.map((d) => ({ debtor: d.debtor, creditor: d.creditor, amount: parseFiat(d.amount) })),
          );
          return ok({
            transfers: transfers.map((t) => ({
              from: t.debtor,
              to: t.creditor,
              amount: formatFiat(t.amount),
            })),
            transferCount: transfers.length,
            inputCount: debts.length,
          });
        } catch (e) {
          return fail(e instanceof Error ? e.message : "netting failed");
        }
      },
    );

    server.registerTool(
      "get_balances",
      {
        title: "Live agent wallet balances",
        description:
          "Read the demo agents' USDC balances, the settlement contract's retained " +
          "USDC (should be 0), and the KeeperHub relayer's ETH — straight from Base " +
          "Sepolia RPC. No cache, no mock. Call before and after settle_tab to see " +
          "real money move.",
        inputSchema: {},
      },
      async () => {
        const { signers, failure } = requireSigners();
        if (failure) return failure;
        const contract = settlementContractAddress();
        if (!contract) return fail("NEXT_PUBLIC_SETTLEMENT_CONTRACT is not set on this deployment.");
        try {
          return ok({ ...(await agentChainSnapshot(signers!, contract as `0x${string}`)) });
        } catch (e) {
          return fail(e instanceof Error ? e.message : "chain read failed");
        }
      },
    );

    server.registerTool(
      "prepare_settlement",
      {
        title: "Prepare a settlement (dry run)",
        description:
          "Net the given debts, freeze a canonical ledger, and return its ledgerHash " +
          "+ settlementId WITHOUT signing or broadcasting anything. Pass the returned " +
          "receiptRef to settle_tab to execute exactly this settlement. Deterministic: " +
          "same debts + same receiptRef always produce the same settlementId, and the " +
          "contract permanently rejects a settlementId it has already executed.",
        inputSchema: {
          debts: agentDebts,
          receiptRef: z.string().min(1).max(200).optional()
            .describe("Optional label binding this settlement to a receipt; defaults to a timestamped ref"),
        },
      },
      async ({ debts, receiptRef }) => {
        const { signers, failure } = requireSigners();
        if (failure) return failure;
        try {
          const prepared = prepareAgentSettlement(debts, addressById(signers!), receiptRef);
          return ok({
            dryRun: true,
            settlementId: prepared.settlementId,
            ledgerHash: prepared.ledgerHash,
            receiptRef: prepared.receiptRef,
            nettedTransfers: prepared.transfers.map((t) => ({
              from: t.fromId,
              to: t.toId,
              usdc: formatUsdcMinor(t.value),
            })),
            payouts: prepared.payouts.map((p) => ({ creditor: p.creditor, usdc: formatUsdcMinor(p.value) })),
            next: "Call settle_tab with the same debts and this receiptRef (confirm: true) to execute onchain.",
          });
        } catch (e) {
          return fail(e instanceof Error ? e.message : "prepare failed");
        }
      },
    );

    server.registerTool(
      "settle_tab",
      {
        title: "Settle a tab onchain (real money moves)",
        description:
          "Execute a REAL settlement on Base Sepolia: nets the debts, freezes the " +
          "canonical ledger, signs an EIP-3009 ReceiveWithAuthorization per debtor " +
          "with the server-held demo keys, simulates via KeeperHub (a revert here " +
          "means nothing is broadcast), then submits one atomic executeSettlement. " +
          "Returns the KeeperHub executionId — poll settlement_status until the " +
          "verdict is VERIFIED_SETTLED. Testnet USDC, but the pipeline is the real " +
          "one end to end. Requires confirm: true.",
        inputSchema: {
          debts: agentDebts,
          receiptRef: z.string().min(1).max(200).optional()
            .describe("Use the receiptRef from prepare_settlement to execute exactly that dry run"),
          confirm: z.boolean().describe("Must be true — this broadcasts a real onchain transaction"),
        },
      },
      async ({ debts, receiptRef, confirm }) => {
        if (confirm !== true) {
          return fail("confirm must be true — settle_tab broadcasts a real Base Sepolia transaction.");
        }
        const { client, blockedReason } = keeperHubClient();
        if (!client) return fail(`blocked: ${blockedReason}`);
        const contract = settlementContractAddress();
        if (!contract) return fail("NEXT_PUBLIC_SETTLEMENT_CONTRACT is not set on this deployment.");
        const { accounts, signers, failure } = requireSigners();
        if (failure) return failure;

        try {
          const prepared = prepareAgentSettlement(debts, addressById(signers!), receiptRef);
          const signed = await signPreparedTransfers(prepared, accounts!, contract as `0x${string}`);
          const body = SettleBodySchema.parse({
            settlementId: prepared.settlementId,
            ledgerHash: prepared.ledgerHash,
            transfers: signed,
            payouts: prepared.payouts,
          });
          const call = settleContractCall(body, contract);

          // SIMULATE FIRST, ALWAYS. A revert here means nothing was broadcast.
          try {
            await client.simulateContractCall(call);
          } catch (e) {
            if (e instanceof SimulationRevertError) {
              return fail(
                `simulation reverted — nothing was broadcast. ${e.message}` +
                  (prepared.receiptRef.startsWith("mcp-agent:")
                    ? ""
                    : " If this settlementId was already executed, change receiptRef to start a fresh one."),
              );
            }
            if (e instanceof KeeperHubError) {
              return fail(`KeeperHub simulation ${e.httpStatus}: ${keeperHubDetail(e)}`);
            }
            throw e;
          }

          const idempotencyKey = deriveIdempotencyKey({
            taskId: call.taskId!,
            chainId: BASE_SEPOLIA_CHAIN_ID,
            recipientAddress: contract,
            amount: "0",
            tokenAddress: body.settlementId,
          });
          const accepted = (await client.executeContractCall(call, idempotencyKey)) as Record<
            string,
            unknown
          > & { execution?: { id?: string } };
          const executionId =
            (accepted.executionId as string | undefined) ??
            (accepted.id as string | undefined) ??
            accepted.execution?.id ??
            null;

          return ok({
            broadcast: true,
            executionId,
            settlementId: prepared.settlementId,
            ledgerHash: prepared.ledgerHash,
            receiptRef: prepared.receiptRef,
            nettedTransfers: prepared.transfers.map((t) => ({
              from: t.fromId,
              to: t.toId,
              usdc: formatUsdcMinor(t.value),
            })),
            payouts: prepared.payouts.map((p) => ({ creditor: p.creditor, usdc: formatUsdcMinor(p.value) })),
            next: executionId
              ? `Poll settlement_status with executionId "${executionId}" until the verdict is VERIFIED_SETTLED, then get_balances to see the money moved.`
              : "KeeperHub accepted the execution but returned no recognizable executionId — inspect the accepted payload.",
            accepted,
          });
        } catch (e) {
          if (e instanceof KeeperHubError) {
            return fail(`KeeperHub execute ${e.httpStatus}: ${keeperHubDetail(e)}`);
          }
          return fail(e instanceof Error ? e.message : "settlement failed");
        }
      },
    );

    server.registerTool(
      "settlement_status",
      {
        title: "Check a KeeperHub settlement",
        description:
          "Fetch the live status of a KeeperHub execution and classify it with " +
          "FINALTab's fail-closed rules: VERIFIED_SETTLED only when the chain " +
          "returned verified, successful receipts. A bare transaction hash is " +
          "never treated as proof.",
        inputSchema: {
          executionId: z.string().regex(/^[A-Za-z0-9_-]{6,128}$/).describe("KeeperHub execution id"),
        },
      },
      async ({ executionId }) => {
        const { client, blockedReason } = keeperHubClient();
        if (!client) return fail(`blocked: ${blockedReason}`);
        try {
          const { body } = await client.getStatus(executionId);
          return ok({ verdict: classifyExecution(body), status: body });
        } catch (e) {
          if (e instanceof KeeperHubError) return fail(`KeeperHub ${e.httpStatus}: ${e.message}`);
          return fail(e instanceof Error ? e.message : "status fetch failed");
        }
      },
    );
  },
  {
    serverInfo: { name: "finaltab", version: "1.1.0" },
    instructions:
      "FINALTab: deterministic bill splitting with real onchain settlement on Base Sepolia. " +
      "All money is integer minor units; shares always sum to the total. " +
      "Compute: split_equal / split_weighted for allocation, net_debts to minimize transfers. " +
      "Money (three demo agents — vee, hem, ravi — with server-held testnet wallets): " +
      "get_balances reads live USDC balances from chain; prepare_settlement dry-runs a " +
      "frozen ledger; settle_tab signs EIP-3009 authorizations, simulates, and broadcasts " +
      "one atomic executeSettlement via KeeperHub (requires confirm: true). " +
      "The full agent loop: get_balances → prepare_settlement → settle_tab → " +
      "settlement_status (poll to VERIFIED_SETTLED) → get_balances. " +
      "Verdicts are fail-closed: anything unproven is reported as unproven.",
  },
);

export { handler as GET, handler as POST, handler as DELETE };

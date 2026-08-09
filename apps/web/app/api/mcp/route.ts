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
import { classifyExecution, KeeperHubError } from "@finaltab/keeperhub";
import { keeperHubClient } from "@/lib/server/clients";

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
    serverInfo: { name: "finaltab", version: "1.0.0" },
    instructions:
      "FINALTab's deterministic bill-splitting engine. All money is integer minor units; " +
      "shares always sum to the total. Use split_equal or split_weighted for allocation, " +
      "net_debts to minimize transfers, settlement_status to verify a KeeperHub execution. " +
      "Settlement verdicts are fail-closed: anything unproven is reported as unproven.",
  },
);

export { handler as GET, handler as POST, handler as DELETE };

import { AsyncLocalStorage } from "node:async_hooks";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod4";
import {
  BASE_SEPOLIA_CHAIN_ID,
  equalSplit,
  formatFiat,
  largestRemainderSplit,
  nettedTransfers,
  parseFiat,
  sum,
} from "@finaltab/engine";
import {
  classifyExecution,
  KeeperHubError,
  SimulationRevertError,
} from "@finaltab/keeperhub";
import { keeperHubClient, keeperHubDetail } from "@/lib/server/clients";
import { SettleBodySchema, type SettleBody } from "@/lib/server/settlement";
import {
  AGENT_SIGNERS,
  agentChainSnapshot,
  formatUsdcMinor,
  prepareAgentSettlement,
  resolveAgentSigners,
  signPreparedTransfers,
  type AgentSignerId,
} from "@/lib/server/agentSettlement";
import {
  allocateMcpReceipt,
  createBroadcastApprovalChallenge,
  isDemoMoneyEnabled,
  mcpScopesForPayload,
  prepareMcpReceiptSettlement,
  requiredMcpV2Contract,
  type SignedBroadcastApproval,
} from "@/lib/server/mcpSettlement";
import {
  simulateSignedSettlement,
  submitApprovedSettlement,
} from "@/lib/server/settlementSubmission";
import {
  authorizeApiRequest,
  withAccessHeaders,
  type ApiPrincipal,
  type ApiScope,
} from "@/lib/server/apiAccess";
import { verifyExecutionOnchain } from "@/lib/server/onchainProof";

export const runtime = "nodejs";
export const maxDuration = 60;

const principalContext = new AsyncLocalStorage<ApiPrincipal>();

function currentPrincipal(): ApiPrincipal {
  const principal = principalContext.getStore();
  if (!principal) throw new Error("authenticated MCP principal context is unavailable");
  return principal;
}

const amount = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "decimal string with at most 2 decimal places, e.g. \"54.00\"");
const participantId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const signature = z.string().regex(/^0x[0-9a-fA-F]{130}$/);

const allocationParticipant = z.object({
  id: participantId,
  name: z.string().min(1).max(160),
  address: address.optional(),
});
const receipt = z.object({
  id: z.string().min(1).max(160),
  currency: z.literal("USD").describe("USDC settlement is USD-only; other fiat requires an explicit FX quote"),
  lines: z.array(z.object({
    id: participantId,
    label: z.string().min(1).max(160),
    amountUsd: amount,
  })).min(1).max(200).describe("Every item, tax, service, and tip component is an explicit positive line"),
  statedTotalUsd: amount.optional().describe("When provided, must equal the exact line sum"),
});
const assignment = z.object({
  lineId: participantId,
  weights: z.array(z.object({
    participantId,
    weight: z.number().int().min(0).max(1_000_000),
  })).min(1).max(50),
});
const allocationInput = {
  receipt,
  participants: z.array(allocationParticipant).min(1).max(50),
  assignments: z.array(assignment).min(1).max(200),
};

const signedTransfer = z.object({
  from: address,
  to: address,
  value: z.string().regex(/^[1-9][0-9]*$/),
  validAfter: z.string().regex(/^\d+$/),
  validBefore: z.string().regex(/^\d+$/),
  nonce: bytes32,
  authV: z.number().int().min(27).max(28),
  authR: bytes32,
  authS: bytes32,
  consentV: z.number().int().min(27).max(28),
  consentR: bytes32,
  consentS: bytes32,
});
const signedSettlement = z.object({
  settlementId: bytes32,
  ledgerHash: bytes32,
  transfers: z.array(signedTransfer).min(1).max(50),
  payouts: z.array(z.object({
    creditor: address,
    value: z.string().regex(/^[1-9][0-9]*$/),
  })).min(1).max(50),
});
const approvalArtifact = z.object({
  version: z.literal(1),
  approvalId: z.uuid(),
  principalSubject: z.string().min(1).max(200),
  approver: address,
  chainId: z.literal(BASE_SEPOLIA_CHAIN_ID),
  contractAddress: address,
  settlementId: bytes32,
  ledgerHash: bytes32,
  issuedAt: z.string().regex(/^\d+$/),
  expiresAt: z.string().regex(/^\d+$/),
  signature,
});

const agentId = z.enum(["vee", "hem", "ravi"]);
const agentDebts = z.array(z.object({
  debtor: agentId.describe("Who owes"),
  creditor: agentId.describe("Who is owed"),
  amountUsd: amount.describe("What debtor owes creditor in USD, e.g. \"4.20\""),
})).min(1).max(20);

const LOCAL_READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const NETWORK_READ_ANNOTATIONS = { ...LOCAL_READ_ANNOTATIONS, openWorldHint: true } as const;
const VALUE_WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
} as const;

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

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof KeeperHubError) return `KeeperHub ${error.httpStatus}: ${keeperHubDetail(error)}`;
  return error instanceof Error ? error.message : fallback;
}

function allocationOutput(allocation: ReturnType<typeof allocateMcpReceipt>) {
  return {
    receiptId: allocation.receiptId,
    currency: allocation.currency,
    total: formatFiat(allocation.totalMinor),
    participants: allocation.participants,
    lines: allocation.lines.map((line) => ({
      id: line.id,
      label: line.label,
      amount: formatFiat(line.amountMinor),
      shares: line.shares.map((share) => ({
        participantId: share.participantId,
        amount: formatFiat(share.amountMinor),
      })),
    })),
    shares: allocation.shares.map((share) => ({
      participantId: share.participantId,
      amount: formatFiat(share.amountMinor),
    })),
    sumsToTotal: sum(allocation.shares.map((share) => share.amountMinor)) === allocation.totalMinor,
  };
}

function parseSignedSettlement(value: unknown): SettleBody {
  return SettleBodySchema.parse(value);
}

function requireDemoSigners() {
  if (!isDemoMoneyEnabled()) {
    return {
      accounts: null,
      signers: null,
      failure: fail(
        "testnet demo money tools are disabled. They require both " +
        "FINALTAB_ENABLE_DEMO_MONEY_TOOLS=true and FINALTAB_SETTLEMENT_CONTRACT_VERSION=2.",
      ),
    };
  }
  const { accounts, status } = resolveAgentSigners();
  if (!accounts) {
    return {
      accounts: null,
      signers: null,
      failure: fail(
        `testnet demo signer keys unavailable: ${AGENT_SIGNERS.map((item) => `${item.id}=${status[item.id]}`).join(", ")}`,
      ),
    };
  }
  const signers = AGENT_SIGNERS.map((item) => ({
    id: item.id,
    name: item.name,
    address: accounts.get(item.id)!.address,
  }));
  return { accounts, signers, failure: null };
}

function demoAddressMap(signers: Array<{ id: string; address: `0x${string}` }>) {
  return Object.fromEntries(signers.map((signer) => [signer.id, signer.address])) as Record<
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
        annotations: LOCAL_READ_ANNOTATIONS,
        description:
          "Cent-perfect equal allocation using integer minor units and largest remainder. The shares always sum exactly to the caller's total.",
        inputSchema: {
          total: amount,
          people: z.array(participantId).min(1).max(50),
        },
      },
      async ({ total, people }) => {
        try {
          const totalMinor = parseFiat(total);
          const shares = equalSplit(totalMinor, people.length);
          return ok({
            shares: people.map((id, index) => ({ id, share: formatFiat(shares[index]!) })),
            total: formatFiat(totalMinor),
            sumsToTotal: sum(shares) === totalMinor,
          });
        } catch (error) {
          return fail(errorMessage(error, "split failed"));
        }
      },
    );

    server.registerTool(
      "split_weighted",
      {
        title: "Split a total by weights",
        annotations: LOCAL_READ_ANNOTATIONS,
        description: "Cent-perfect weighted allocation with deterministic largest-remainder tie breaking.",
        inputSchema: {
          total: amount,
          entries: z.array(z.object({
            id: participantId,
            weight: z.number().int().min(0).max(1_000_000),
          })).min(1).max(50),
        },
      },
      async ({ total, entries }) => {
        try {
          const totalMinor = parseFiat(total);
          const shares = largestRemainderSplit(totalMinor, entries.map((entry) => BigInt(entry.weight)));
          return ok({
            shares: entries.map((entry, index) => ({ id: entry.id, share: formatFiat(shares[index]!) })),
            total: formatFiat(totalMinor),
            sumsToTotal: sum(shares) === totalMinor,
          });
        } catch (error) {
          return fail(errorMessage(error, "split failed"));
        }
      },
    );

    server.registerTool(
      "net_debts",
      {
        title: "Net a debt graph",
        annotations: LOCAL_READ_ANNOTATIONS,
        description: "Collapse arbitrary pairwise debts into a deterministic graph with at most n-1 transfers.",
        inputSchema: {
          debts: z.array(z.object({
            debtor: participantId,
            creditor: participantId,
            amount,
          })).min(1).max(200),
        },
      },
      async ({ debts }) => {
        try {
          const transfers = nettedTransfers(debts.map((debt) => ({
            debtor: debt.debtor,
            creditor: debt.creditor,
            amount: parseFiat(debt.amount),
          })));
          return ok({
            transfers: transfers.map((transfer) => ({
              from: transfer.debtor,
              to: transfer.creditor,
              amount: formatFiat(transfer.amount),
            })),
            transferCount: transfers.length,
            inputCount: debts.length,
          });
        } catch (error) {
          return fail(errorMessage(error, "netting failed"));
        }
      },
    );

    server.registerTool(
      "allocate_receipt",
      {
        title: "Allocate an arbitrary receipt",
        annotations: LOCAL_READ_ANNOTATIONS,
        description:
          "Allocate caller-supplied USD receipt lines across arbitrary participants. Every line, including tax/service/tip, has explicit weights and is reconciled cent-perfectly.",
        inputSchema: allocationInput,
      },
      async (input) => {
        try {
          return ok(allocationOutput(allocateMcpReceipt(input)));
        } catch (error) {
          return fail(errorMessage(error, "receipt allocation failed"));
        }
      },
    );

    server.registerTool(
      "prepare_receipt_settlement",
      {
        title: "Prepare an externally signed V2 settlement",
        annotations: LOCAL_READ_ANNOTATIONS,
        description:
          "Turn a caller-supplied receipt, participants, assignments, payer, and wallet addresses into a frozen V2 plan. Returns exact EIP-3009 and FINALTab SettlementConsent typed data for each debtor wallet; FINALTab does not hold those keys.",
        inputSchema: {
          ...allocationInput,
          participants: z.array(allocationParticipant.extend({ address })).min(2).max(50),
          payerId: participantId,
          validBefore: z.string().regex(/^\d+$/).optional().describe("Unix seconds; defaults to now + 1 hour"),
        },
      },
      async (input) => {
        try {
          const contract = requiredMcpV2Contract();
          const prepared = prepareMcpReceiptSettlement(input, contract);
          return ok({
            v2: true,
            chainId: BASE_SEPOLIA_CHAIN_ID,
            contract,
            allocation: allocationOutput(prepared.allocation),
            payerId: prepared.payerId,
            canonicalLedger: JSON.parse(prepared.canonicalLedgerJson),
            ledgerHash: prepared.ledgerHash,
            settlementId: prepared.settlementId,
            debits: prepared.debits,
            payouts: prepared.payouts,
            signatureRequests: prepared.signatureRequests,
            next:
              "Each debtor signs both typed-data payloads. Assemble those signatures into signedSettlement, call simulate_signed_settlement, then create_broadcast_approval_challenge.",
          });
        } catch (error) {
          return fail(errorMessage(error, "settlement preparation failed"));
        }
      },
    );

    server.registerTool(
      "simulate_signed_settlement",
      {
        title: "Simulate an externally signed V2 settlement",
        annotations: NETWORK_READ_ANNOTATIONS,
        description:
          "Validate a complete externally signed V2 payload and simulate the exact contract call through KeeperHub. This never broadcasts and never accepts V1 plans.",
        inputSchema: { signedSettlement },
      },
      async ({ signedSettlement: value }) => {
        try {
          requiredMcpV2Contract();
          const body = parseSignedSettlement(value);
          const { simulation } = await simulateSignedSettlement(body);
          return ok({
            safeToRequestApproval: true,
            simulated: true,
            broadcast: false,
            settlementId: body.settlementId,
            ledgerHash: body.ledgerHash,
            simulation,
            next: "Call create_broadcast_approval_challenge, show its exact message to a human, and have that wallet personal-sign it.",
          });
        } catch (error) {
          if (error instanceof SimulationRevertError) {
            return fail(`simulation reverted; nothing was broadcast. ${error.message}`);
          }
          return fail(errorMessage(error, "simulation failed"));
        }
      },
    );

    server.registerTool(
      "create_broadcast_approval_challenge",
      {
        title: "Create a human broadcast-approval challenge",
        annotations: LOCAL_READ_ANNOTATIONS,
        description:
          "Create a short-lived EIP-191 message bound to the authenticated MCP principal, V2 contract, ledger, plan, and approval ID. A human must review and personal-sign this exact message; it may be retried until expiry and this tool does not broadcast.",
        inputSchema: {
          settlementId: bytes32,
          ledgerHash: bytes32,
          approver: address,
          ttlSeconds: z.number().int().min(60).max(900).optional(),
        },
      },
      async ({ settlementId, ledgerHash, approver, ttlSeconds }) => {
        try {
          const contract = requiredMcpV2Contract();
          const challenge = createBroadcastApprovalChallenge({
            principalSubject: currentPrincipal().subject,
            approver,
            contractAddress: contract,
            settlementId,
            ledgerHash,
            ttlSeconds,
          });
          return ok({
            ...challenge,
            broadcast: false,
            signingMethod: "personal_sign / EIP-191",
            next:
              "After the named human wallet signs message exactly, append signature to artifact and pass it to submit_signed_settlement with the same signedSettlement.",
          });
        } catch (error) {
          return fail(errorMessage(error, "approval challenge failed"));
        }
      },
    );

    server.registerTool(
      "submit_signed_settlement",
      {
        title: "Submit an approved, externally signed V2 settlement",
        annotations: VALUE_WRITE_ANNOTATIONS,
        description:
          "Value-moving tool. Requires externally produced debtor signatures plus a fresh wallet-signed human approval artifact. Revalidates the full V2 plan, re-simulates immediately, then submits one idempotent atomic call through KeeperHub.",
        inputSchema: {
          signedSettlement,
          approval: approvalArtifact,
        },
      },
      async ({ signedSettlement: value, approval }) => {
        try {
          requiredMcpV2Contract();
          const body = parseSignedSettlement(value);
          const submitted = await submitApprovedSettlement({
            signedSettlement: body,
            approval: approval as SignedBroadcastApproval,
            principalSubject: currentPrincipal().subject,
            allowedApprovers: body.transfers.map((transfer) => transfer.from),
          });
          return ok({
            broadcast: true,
            v2: true,
            settlementId: body.settlementId,
            ledgerHash: body.ledgerHash,
            approval: submitted.verifiedApproval,
            simulation: { success: submitted.simulation.success, wouldRevert: submitted.simulation.wouldRevert },
            accepted: submitted.accepted,
            proofCapability: submitted.proofCapability,
            next: `Poll settlement_status with executionId \"${submitted.accepted.executionId}\", settlementId \"${body.settlementId}\", and ledgerHash \"${body.ledgerHash}\" until the final verdict is VERIFIED_SETTLED.`,
          });
        } catch (error) {
          if (error instanceof SimulationRevertError) {
            return fail(`simulation reverted; nothing was broadcast. ${error.message}`);
          }
          return fail(errorMessage(error, "settlement submission failed"));
        }
      },
    );

    server.registerTool(
      "settlement_status",
      {
        title: "Verify a KeeperHub settlement independently",
        annotations: NETWORK_READ_ANNOTATIONS,
        description:
          "Fetch KeeperHub status and independently re-fetch every receipt from Base Sepolia RPC. VERIFIED_SETTLED requires KeeperHub's fail-closed proof plus a successful receipt whose configured V2 contract, indexed settlementId, and indexed ledgerHash exactly match the supplied frozen plan.",
        inputSchema: {
          executionId: z.string().regex(/^[A-Za-z0-9_-]{6,128}$/),
          settlementId: bytes32,
          ledgerHash: bytes32,
        },
      },
      async ({ executionId, settlementId, ledgerHash }) => {
        const { client, blockedReason } = keeperHubClient();
        if (!client) return fail(`blocked: ${blockedReason}`);
        try {
          const contractAddress = requiredMcpV2Contract();
          const { body } = await client.getStatus(executionId);
          const keeperHubVerdict = classifyExecution(body);
          const independentProof = await verifyExecutionOnchain(body, {
            contractAddress,
            settlementId: settlementId as `0x${string}`,
            ledgerHash: ledgerHash as `0x${string}`,
          });
          const verdict = keeperHubVerdict.verdict === "VERIFIED_SETTLED" && !independentProof.verified
            ? {
                verdict: "UNPROVEN" as const,
                reason: "KeeperHub proof did not pass independent Base Sepolia receipt and V2 contract-log verification.",
                receipts: keeperHubVerdict.receipts,
              }
            : keeperHubVerdict;
          return ok({ verdict, keeperHubVerdict, independentProof, status: body });
        } catch (error) {
          return fail(errorMessage(error, "status fetch failed"));
        }
      },
    );

    server.registerTool(
      "demo_get_balances",
      {
        title: "TESTNET DEMO: read fixed wallet balances",
        annotations: NETWORK_READ_ANNOTATIONS,
        description:
          "Optional Base Sepolia demo-only tool for the named Vee/Hem/Ravi test wallets. Disabled unless explicitly enabled; it is not the production user-wallet path.",
        inputSchema: {},
      },
      async () => {
        const { signers, failure } = requireDemoSigners();
        if (failure) return failure;
        try {
          const contract = requiredMcpV2Contract();
          return ok({ ...(await agentChainSnapshot(signers!, contract)) });
        } catch (error) {
          return fail(errorMessage(error, "chain read failed"));
        }
      },
    );

    server.registerTool(
      "demo_prepare_settlement",
      {
        title: "TESTNET DEMO: prepare fixed-wallet settlement",
        annotations: LOCAL_READ_ANNOTATIONS,
        description:
          "Optional Vee/Hem/Ravi testnet fixture. Disabled by default in production. Real users should call prepare_receipt_settlement and sign in their own wallets.",
        inputSchema: {
          debts: agentDebts,
          receiptRef: z.string().min(1).max(200).optional(),
        },
      },
      async ({ debts, receiptRef }) => {
        const { signers, failure } = requireDemoSigners();
        if (failure) return failure;
        try {
          const contract = requiredMcpV2Contract();
          const prepared = prepareAgentSettlement(debts, demoAddressMap(signers!), contract, receiptRef);
          const demoApprover = process.env.FINALTAB_DEMO_APPROVER_ADDRESS ?? null;
          return ok({
            demoOnly: true,
            broadcast: false,
            settlementId: prepared.settlementId,
            ledgerHash: prepared.ledgerHash,
            receiptRef: prepared.receiptRef,
            debits: prepared.debits,
            payouts: prepared.payouts,
            requiredBroadcastApprover: demoApprover,
            next:
              "Call create_broadcast_approval_challenge with requiredBroadcastApprover, have that operator personal-sign it, then call demo_settle_tab.",
          });
        } catch (error) {
          return fail(errorMessage(error, "demo preparation failed"));
        }
      },
    );

    server.registerTool(
      "demo_settle_tab",
      {
        title: "TESTNET DEMO: approved fixed-wallet settlement",
        annotations: VALUE_WRITE_ANNOTATIONS,
        description:
          "Optional value-moving Base Sepolia fixture using server-held throwaway test keys. Disabled by default and still requires a configured human operator's signed approval artifact; never use for real users.",
        inputSchema: {
          debts: agentDebts,
          receiptRef: z.string().min(1).max(200).optional(),
          approval: approvalArtifact,
        },
      },
      async ({ debts, receiptRef, approval }) => {
        const { accounts, signers, failure } = requireDemoSigners();
        if (failure) return failure;
        try {
          const contract = requiredMcpV2Contract();
          const demoApprover = process.env.FINALTAB_DEMO_APPROVER_ADDRESS;
          if (!demoApprover || !/^0x[0-9a-fA-F]{40}$/.test(demoApprover)) {
            return fail("FINALTAB_DEMO_APPROVER_ADDRESS must name the human demo operator wallet.");
          }
          const prepared = prepareAgentSettlement(debts, demoAddressMap(signers!), contract, receiptRef);
          const signed = await signPreparedTransfers(prepared, accounts!, contract);
          const body = parseSignedSettlement({
            settlementId: prepared.settlementId,
            ledgerHash: prepared.ledgerHash,
            transfers: signed,
            payouts: prepared.payouts,
          });
          const submitted = await submitApprovedSettlement({
            signedSettlement: body,
            approval: approval as SignedBroadcastApproval,
            principalSubject: currentPrincipal().subject,
            allowedApprovers: [demoApprover],
          });
          return ok({
            demoOnly: true,
            broadcast: true,
            executionId: submitted.accepted.executionId,
            settlementId: body.settlementId,
            ledgerHash: body.ledgerHash,
            approval: submitted.verifiedApproval,
            proofCapability: submitted.proofCapability,
            debits: prepared.debits.map((debit) => ({ debtor: debit.fromId, usdc: formatUsdcMinor(debit.value) })),
            payouts: prepared.payouts.map((payout) => ({ creditor: payout.creditor, usdc: formatUsdcMinor(payout.value) })),
            accepted: submitted.accepted,
          });
        } catch (error) {
          if (error instanceof SimulationRevertError) {
            return fail(`simulation reverted; nothing was broadcast. ${error.message}`);
          }
          return fail(errorMessage(error, "demo settlement failed"));
        }
      },
    );
  },
  {
    serverInfo: { name: "finaltab", version: "2.0.0" },
    instructions:
      "FINALTab v2 is an authenticated MCP receipt-to-proof service for Base Sepolia; V1 and unversioned contracts fail closed. " +
      "submit_signed_settlement is the only production value-moving tool. It requires settlements:submit scope, externally produced V2 debtor signatures, " +
      "a short-lived exact-plan human approval artifact, immediate simulation, and KeeperHub idempotency. Approval retries are allowed until expiry; the V2 settlement identity prevents duplicate settlement. The server never holds arbitrary users' keys. " +
      "VERIFIED_SETTLED additionally requires independent Base Sepolia RPC proof. Deterministic tools: split_equal, split_weighted, net_debts. " +
      "Production journey: allocate_receipt -> prepare_receipt_settlement -> have every debtor wallet sign both returned typed-data payloads -> " +
      "simulate_signed_settlement -> create_broadcast_approval_challenge -> show its exact message to a human and obtain personal_sign -> " +
      "submit_signed_settlement -> settlement_status. " +
      "demo_* tools are explicitly testnet-only, disabled by default, and are not the production user-wallet workflow.",
  },
);

const MAX_MCP_BYTES = 900_000;

class McpPayloadTooLarge extends Error {}

async function readMcpJsonWithLimit(request: Request): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isFinite(parsedLength) || parsedLength < 0) throw new Error("invalid Content-Length");
    if (parsedLength > MAX_MCP_BYTES) throw new McpPayloadTooLarge();
  }
  const stream = request.clone().body;
  if (!stream) throw new Error("MCP POST body is required");
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let raw = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_MCP_BYTES) {
      await reader.cancel();
      throw new McpPayloadTooLarge();
    }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  return JSON.parse(raw);
}

function accessOptions(scope: ApiScope) {
  if (scope === "settlements:submit") return { rateLimit: 5, rateWindowMs: 60_000 };
  if (scope === "settlements:prepare") return { rateLimit: 30, rateWindowMs: 60_000 };
  return { rateLimit: 120, rateWindowMs: 60_000 };
}

function mergeHeaders(target: Headers, source: Headers): void {
  source.forEach((value, key) => target.set(key, value));
}

async function authorizeScopes(request: Request, scopes: ApiScope[], requireSameOrigin: boolean) {
  const headers = new Headers();
  let principal: ApiPrincipal | null = null;
  for (const scope of scopes) {
    const access = await authorizeApiRequest(request, {
      scope,
      maxBytes: MAX_MCP_BYTES,
      requireSameOriginForSession: requireSameOrigin,
      ...accessOptions(scope),
    });
    if (!access.ok) return { ok: false as const, response: withAccessHeaders(access.response, headers) };
    principal ??= access.principal;
    mergeHeaders(headers, access.headers);
  }
  return { ok: true as const, principal: principal!, headers };
}

async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await readMcpJsonWithLimit(request);
  } catch (error) {
    if (error instanceof McpPayloadTooLarge) {
      return Response.json({ error: "PAYLOAD_TOO_LARGE", maxBytes: MAX_MCP_BYTES }, { status: 413 });
    }
    return Response.json({ error: "INVALID_MCP_JSON" }, { status: 400 });
  }
  const access = await authorizeScopes(request, mcpScopesForPayload(payload), true);
  if (!access.ok) return access.response;
  return principalContext.run(access.principal, async () =>
    withAccessHeaders(await handler(request), access.headers));
}

async function GET(request: Request): Promise<Response> {
  const access = await authorizeScopes(request, ["settlements:read"], false);
  if (!access.ok) return access.response;
  return principalContext.run(access.principal, async () =>
    withAccessHeaders(await handler(request), access.headers));
}

async function DELETE(request: Request): Promise<Response> {
  const access = await authorizeScopes(request, ["settlements:read"], true);
  if (!access.ok) return access.response;
  return principalContext.run(access.principal, async () =>
    withAccessHeaders(await handler(request), access.headers));
}

export { GET, POST, DELETE };

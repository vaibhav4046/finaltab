import { z } from "zod";
import { GroqApiError, proposeAllocation } from "@finaltab/vision";
import {
  ParsedReceiptSchema,
  reconcileAllocation,
  sharesToDebts,
  isSettlementCurrency,
  SETTLEMENT_CURRENCY,
} from "@finaltab/engine";
import { groqClient, jsonError } from "@/lib/server/clients";
import { ApiPayloadTooLargeError, authorizeApiRequest, readJsonBodyWithLimit, withAccessHeaders } from "@/lib/server/apiAccess";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  receipt: ParsedReceiptSchema,
  participants: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })).min(1),
  payerId: z.string().min(1),
  instruction: z.string().min(1).max(2000),
});

export async function POST(req: Request): Promise<Response> {
  const access = await authorizeApiRequest(req, {
    scope: "receipts:write",
    maxBytes: 300_000,
    rateLimit: 30,
    rateWindowMs: 60_000,
  });
  if (!access.ok) return access.response;
  const secured = (response: Response) => withAccessHeaders(response, access.headers);

  // Allocation JSON is compact (one row per receipt item). A bounded output
  // cap keeps complex tables inside conservative provider TPM limits.
  const client = groqClient({ maxCompletionTokens: 1536 });
  if (!client) return secured(jsonError("GROQ_API_KEY is not configured on the server.", 501));

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await readJsonBodyWithLimit(req, 300_000));
  } catch (e) {
    if (e instanceof ApiPayloadTooLargeError) {
      return secured(Response.json({ error: "PAYLOAD_TOO_LARGE", maxBytes: e.maxBytes }, { status: 413 }));
    }
    return secured(jsonError(e instanceof Error ? e.message : "invalid request body", 400));
  }

  try {
    const raw = await proposeAllocation(client, body);
    // The model's proposal is advisory. The deterministic reconciler is the
    // source of truth for every unit of money that leaves this endpoint, and
    // the user's payer selection overrides whatever the model echoed back.
    const proposal = { ...raw.proposal, payerId: body.payerId };
    const result = reconcileAllocation(body.receipt, proposal);
    if (!result.ok || !result.shares) {
      return secured(Response.json(
        { proposal, ok: false, issues: result.issues.map((i) => `${i.code}: ${i.message}`) },
        { status: 422 },
      ));
    }
    const shares = [...result.shares.entries()].map(([id, v]) => ({ id, fiatMinor: v.toString() }));

    // The split is currency-agnostic and always returned. Onchain settlement is
    // not: USDC is USD-denominated, so emitting usdcMinor for a GBP or EUR
    // receipt would bake in an unquoted 1:1 exchange rate. Non-USD ledgers get
    // the arithmetic and no settleable debts.
    const currency = body.receipt.currency;
    if (!isSettlementCurrency(currency)) {
      return secured(Response.json({
        proposal,
        ok: true,
        issues: [],
        shares,
        debts: [],
        settlement: {
          eligible: false,
          currency,
          reason:
            `This receipt is in ${currency}. FINALTab settles in USDC, which is USD-denominated, ` +
            `and it will not invent a ${currency}→USD rate. The split above is exact; ` +
            `onchain settlement is available for ${SETTLEMENT_CURRENCY} receipts only.`,
        },
      }));
    }

    const debts = sharesToDebts(result.shares, proposal.payerId);
    return secured(Response.json({
      proposal,
      ok: true,
      issues: [],
      shares,
      debts: debts.map((d) => ({ debtor: d.debtor, creditor: d.creditor, usdcMinor: d.amount.toString() })),
      settlement: { eligible: true, currency },
    }));
  } catch (e) {
    if (e instanceof GroqApiError && e.httpStatus === 429) {
      return secured(jsonError("Allocation model is busy. Wait a moment, then try again.", 429));
    }
    // Never reflect provider bodies, organization identifiers, billing links,
    // or model diagnostics into the product UI.
    return secured(jsonError("Allocation model is temporarily unavailable.", 502));
  }
}

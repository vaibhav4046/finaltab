import { z } from "zod";
import { proposeAllocation } from "@finaltab/vision";
import { ParsedReceiptSchema, reconcileAllocation, sharesToDebts } from "@finaltab/engine";
import { groqClient, jsonError } from "@/lib/server/clients";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  receipt: ParsedReceiptSchema,
  participants: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })).min(1),
  payerId: z.string().min(1),
  instruction: z.string().min(1).max(2000),
});

export async function POST(req: Request): Promise<Response> {
  const client = groqClient();
  if (!client) return jsonError("GROQ_API_KEY is not configured on the server.", 501);

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "invalid request body", 400);
  }

  try {
    const raw = await proposeAllocation(client, body);
    // The model's proposal is advisory. The deterministic reconciler is the
    // source of truth for every unit of money that leaves this endpoint, and
    // the user's payer selection overrides whatever the model echoed back.
    const proposal = { ...raw.proposal, payerId: body.payerId };
    const result = reconcileAllocation(body.receipt, proposal);
    if (!result.ok || !result.shares) {
      return Response.json(
        { proposal, ok: false, issues: result.issues.map((i) => `${i.code}: ${i.message}`) },
        { status: 422 },
      );
    }
    const debts = sharesToDebts(result.shares, proposal.payerId);
    return Response.json({
      proposal,
      ok: true,
      issues: [],
      shares: [...result.shares.entries()].map(([id, v]) => ({ id, fiatMinor: v.toString() })),
      debts: debts.map((d) => ({ debtor: d.debtor, creditor: d.creditor, usdcMinor: d.amount.toString() })),
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "allocation failed", 502);
  }
}

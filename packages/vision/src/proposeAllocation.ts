import { AllocationProposalSchema, type AllocationProposal, type ParsedReceipt } from "@finaltab/engine";
import {
  GroqClient,
  extractJsonObject,
  isRetryableGroqError,
  type GroqMessage,
  type GroqTokenUsage,
} from "./groqClient.js";
import { ALLOCATION_SYSTEM } from "./prompts.js";

export interface Participant {
  id: string;
  name: string;
}

export interface ProposeAllocationInput {
  receipt: ParsedReceipt;
  participants: Participant[];
  payerId: string;
  instruction: string;
}

export interface ProposeAllocationResult {
  proposal: AllocationProposal;
  rawModelOutput: string;
  attempts: number;
  model: string;
  usage: GroqTokenUsage;
}

const MAX_ATTEMPTS = 3;

/**
 * Turns a natural-language splitting instruction into a structured
 * AllocationProposal. The proposal is advisory: reconcileAllocation() in
 * @finaltab/engine re-validates every index/participant and recomputes all
 * money deterministically. The model never touches amounts.
 */
export async function proposeAllocation(
  client: GroqClient,
  input: ProposeAllocationInput,
): Promise<ProposeAllocationResult> {
  if (input.participants.length === 0) throw new Error("participants must not be empty");
  if (!input.participants.some((p) => p.id === input.payerId)) {
    throw new Error(`payerId ${input.payerId} is not in participants`);
  }

  const userPayload = JSON.stringify(
    {
      receipt: { currency: input.receipt.currency, items: input.receipt.items },
      participants: input.participants,
      payerId: input.payerId,
      instruction: input.instruction,
    },
    null,
    2,
  );

  let lastError: unknown = null;
  const aggregateUsage: GroqTokenUsage = {};
  const addUsage = (usage: GroqTokenUsage) => {
    for (const key of ["promptTokens", "completionTokens", "totalTokens"] as const) {
      const value = usage[key];
      if (value !== undefined) aggregateUsage[key] = (aggregateUsage[key] ?? 0) + value;
    }
  };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const messages: GroqMessage[] = [
      { role: "system", content: ALLOCATION_SYSTEM },
      { role: "user", content: userPayload },
    ];
    if (attempt > 1 && lastError instanceof Error) {
      messages.push({
        role: "user",
        content: `Your previous output was invalid: ${lastError.message}. Output ONLY the corrected JSON object.`,
      });
    }

    let raw: string;
    let model: string;
    let usage: GroqTokenUsage;
    try {
      const completion = await client.completeJsonWithMetadata(messages);
      raw = completion.content;
      model = completion.model;
      usage = completion.usage;
      addUsage(usage);
    } catch (e) {
      // Retryable API failures (json_validate_failed, 429, 5xx) stay in the
      // loop; auth/permanent errors surface immediately.
      if (attempt < MAX_ATTEMPTS && isRetryableGroqError(e)) {
        lastError = e;
        continue;
      }
      throw e;
    }
    try {
      const proposal = AllocationProposalSchema.parse(extractJsonObject(raw));
      return { proposal, rawModelOutput: raw, attempts: attempt, model, usage: aggregateUsage };
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(
    `Allocation proposal failed after ${MAX_ATTEMPTS} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

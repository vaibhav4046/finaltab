import { AllocationProposalSchema, ParsedReceiptSchema } from "@finaltab/engine";
import { z } from "zod";

const UUID = z.string().uuid();
const MINOR = z.string().regex(/^\d{1,18}$/);
// USD cents are converted to 6-decimal USDC minor units for debts, so this
// field can be four digits wider than the corresponding fiat share.
const POSITIVE_MINOR = z.string().regex(/^[1-9]\d{0,31}$/);

const BoundedProposalSchema = AllocationProposalSchema.superRefine((proposal, context) => {
  if (proposal.allocations.length > 100) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "allocation entries are limited to 100" });
  }
  for (const allocation of proposal.allocations) {
    if (allocation.participants.length > 32 || (allocation.weights?.length ?? 0) > 32) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "allocation participant lists are limited to 32" });
    }
    if (allocation.participants.some((id) => !UUID.safeParse(id).success)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "allocation participants must be durable participant IDs" });
    }
  }
  if (!UUID.safeParse(proposal.payerId).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "allocation payer must be a durable participant ID" });
  }
});

export const DurableReceiptStateSchema = z.object({
  receipt: ParsedReceiptSchema,
  attempts: z.number().int().min(1).max(3),
  provider: z.string().trim().min(1).max(80).optional(),
  arithmeticIssues: z.array(z.string().max(500)).max(100),
  imageDataUrl: z.literal(""),
  confirmedAt: z.string().datetime(),
}).strict();

export const DurableAllocationStateSchema = z.object({
  proposal: BoundedProposalSchema,
  instruction: z.string().trim().min(1).max(2_000),
  shares: z.array(z.object({ id: UUID, fiatMinor: MINOR }).strict()).min(1).max(100),
  debts: z.array(z.object({ debtor: UUID, creditor: UUID, usdcMinor: POSITIVE_MINOR }).strict()).max(100),
  settlement: z.object({
    eligible: z.boolean(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    reason: z.string().max(500).optional(),
  }).strict(),
}).strict().superRefine((allocation, context) => {
  if (new Set(allocation.shares.map((share) => share.id)).size !== allocation.shares.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "allocation shares must have unique participants" });
  }
});

export const SaveTabDraftSchema = z.object({
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  receiptState: DurableReceiptStateSchema,
  allocationState: DurableAllocationStateSchema.nullable(),
  payerParticipantId: UUID.nullable(),
}).strict().superRefine((draft, context) => {
  if (draft.allocationState && !draft.payerParticipantId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "a saved allocation requires a payer" });
  }
  if (draft.allocationState && draft.allocationState.proposal.payerId !== draft.payerParticipantId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "the selected payer must match the reconciled proposal" });
  }
});

export type DurableTabDraft = {
  revision: number;
  receiptState: z.infer<typeof DurableReceiptStateSchema>;
  allocationState: z.infer<typeof DurableAllocationStateSchema> | null;
  payerParticipantId: string | null;
  updatedAt: string;
};

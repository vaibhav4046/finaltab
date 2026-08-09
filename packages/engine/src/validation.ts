import { z } from "zod";

/**
 * Receipt schemas. The Groq vision model PROPOSES this shape; Zod + the
 * reconciler decide whether it is accepted. Model output is never trusted.
 * All amounts are decimal strings — converted to bigint minor units by the engine.
 */

const amountString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "amount must be a plain decimal string with at most 2 decimals");

export const ReceiptLineItemSchema = z.object({
  description: z.string().min(1).max(200),
  quantity: z.number().int().positive().max(999),
  /** unit price, fiat decimal string */
  unitPrice: amountString,
  /** line total, fiat decimal string — must equal quantity * unitPrice (reconciler checks) */
  lineTotal: amountString,
});

export const ParsedReceiptSchema = z.object({
  merchant: z.string().min(1).max(120),
  /** ISO date if visible, else null */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  items: z.array(ReceiptLineItemSchema).min(1).max(100),
  subtotal: amountString.nullable(),
  tax: amountString.nullable(),
  tip: amountString.nullable(),
  serviceCharge: amountString.nullable(),
  total: amountString,
  /** model's own confidence 0-1; advisory only */
  confidence: z.number().min(0).max(1),
});

export type ParsedReceipt = z.infer<typeof ParsedReceiptSchema>;
export type ReceiptLineItem = z.infer<typeof ReceiptLineItemSchema>;

/** Allocation proposal from NL step: which participants share each line item. */
export const AllocationProposalSchema = z.object({
  allocations: z
    .array(
      z.object({
        /** index into receipt.items */
        itemIndex: z.number().int().nonnegative(),
        /** participant ids sharing the item; weights optional (default equal) */
        participants: z.array(z.string().min(1)).min(1),
        weights: z.array(z.number().int().positive()).optional(),
      }),
    )
    .min(1),
  /** who paid the bill */
  payerId: z.string().min(1),
  notes: z.string().max(500).optional(),
});

export type AllocationProposal = z.infer<typeof AllocationProposalSchema>;

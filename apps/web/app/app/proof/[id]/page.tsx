import { Capsule } from "@/components/Capsule";

export const metadata = { title: "FINALTab — live settlement proof" };
export const dynamic = "force-dynamic";

export default async function ProofByExecutionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const settlementId = typeof query.settlementId === "string" ? query.settlementId : undefined;
  const ledgerHash = typeof query.ledgerHash === "string" ? query.ledgerHash : undefined;
  return <Capsule executionId={id} settlementId={settlementId} ledgerHash={ledgerHash} />;
}

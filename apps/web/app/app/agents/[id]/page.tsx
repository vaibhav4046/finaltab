import { AgentControlCenter } from "@/components/AgentControlCenter";

export const metadata = {
  title: "FINALTab — settlement review run",
};

export default async function AgentRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AgentControlCenter runId={id} />;
}

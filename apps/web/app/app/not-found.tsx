import Link from "next/link";
import { RouteStatePanel } from "@/components/RouteStatePanel";

export default function WorkspaceNotFound() {
  return (
    <div className="workspace-page route-state-workspace">
      <RouteStatePanel
        eyebrow="Workspace / 404"
        title="That workspace surface does not exist."
        description="Open shared tabs to choose a durable record you can access."
        note="No tab, participant, settlement, or proof was inferred."
        titleId="workspace-not-found-title"
        tone="missing"
        actions={<Link href="/app" className="route-state-action route-state-action-primary">Open shared tabs</Link>}
      />
    </div>
  );
}

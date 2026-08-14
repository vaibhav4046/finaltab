import { RouteStatePanel } from "@/components/RouteStatePanel";

export default function WorkspaceLoading() {
  return (
    <div className="workspace-page route-state-workspace">
      <RouteStatePanel
        eyebrow="Workspace / Loading"
        title="Verifying this workspace view."
        description="The requested tab and access state are being checked."
        note="Draft and proof state stay hidden until the request resolves."
        titleId="workspace-loading-title"
        tone="loading"
      />
    </div>
  );
}

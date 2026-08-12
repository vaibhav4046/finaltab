"use client";

import Link from "next/link";
import { RouteStatePanel, type RouteErrorBoundaryProps } from "@/components/RouteStatePanel";

export default function WorkspaceError({ reset }: RouteErrorBoundaryProps) {
  return (
    <div className="workspace-page route-state-workspace">
      <RouteStatePanel
        eyebrow="Workspace / Stopped"
        title="This workspace view could not be verified."
        description="Retry the request, or reopen a tab from shared history."
        note="Draft, approval, execution, and proof remain unaccepted."
        titleId="workspace-error-title"
        tone="error"
        actions={
          <>
            <button type="button" onClick={reset} className="route-state-action route-state-action-primary">Try again</button>
            <Link href="/app" className="route-state-action route-state-action-secondary">Shared tab history</Link>
          </>
        }
      />
    </div>
  );
}

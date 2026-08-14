"use client";

import Link from "next/link";
import { RouteStatePanel, type RouteErrorBoundaryProps } from "@/components/RouteStatePanel";

export default function ErrorPage({ reset }: RouteErrorBoundaryProps) {
  return (
    <main className="app-shell route-state-screen">
      <RouteStatePanel
        eyebrow="Route / Stopped"
        title="This page stopped before it could show a result."
        description="Retry the request. If it stops again, return home and reopen the surface."
        note="No success state was accepted from the failed request."
        titleId="route-error-title"
        tone="error"
        actions={
          <>
            <button type="button" onClick={reset} className="route-state-action route-state-action-primary">Try again</button>
            <Link href="/" className="route-state-action route-state-action-secondary">Return home</Link>
          </>
        }
      />
    </main>
  );
}

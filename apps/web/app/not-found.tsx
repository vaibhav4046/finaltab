import Link from "next/link";
import { RouteStatePanel } from "@/components/RouteStatePanel";

export default function NotFound() {
  return (
    <main className="app-shell route-state-screen">
      <RouteStatePanel
        eyebrow="404 / Route not found"
        title="No FINALTab route exists here."
        description="Check the address, or return to a known surface."
        note="No settlement, approval, or proof was inferred."
        titleId="not-found-title"
        tone="missing"
        actions={
          <>
            <Link href="/" className="route-state-action route-state-action-primary">Return home</Link>
            <Link href="/app" className="route-state-action route-state-action-secondary">Open workspace</Link>
          </>
        }
      />
    </main>
  );
}

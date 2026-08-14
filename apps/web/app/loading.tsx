import { RouteStatePanel } from "@/components/RouteStatePanel";

export default function Loading() {
  return (
    <main className="app-shell route-state-screen">
      <RouteStatePanel
        eyebrow="FINALTab / Loading"
        title="Opening the requested surface."
        description="Route state is being checked before the page appears."
        note="Settlement and proof state stay hidden until the request resolves."
        titleId="route-loading-title"
        tone="loading"
      />
    </main>
  );
}

"use client";

import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { RouteStatePanel, type RouteErrorBoundaryProps } from "@/components/RouteStatePanel";

export default function GlobalError({ reset }: RouteErrorBoundaryProps) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="app-shell bg-canvas font-sans text-txt">
        <main className="route-state-screen">
          <RouteStatePanel
            eyebrow="FINALTab / Recovery"
            title="FINALTab could not establish a trusted view."
            description="Reload the application. If recovery stops again, return to the public home."
            note="No success state was accepted from the failed application tree."
            titleId="global-error-title"
            tone="error"
            actions={
              <>
                <button type="button" onClick={reset} className="route-state-action route-state-action-primary">Reload FINALTab</button>
                <a href="/" className="route-state-action route-state-action-secondary">Return home</a>
              </>
            }
          />
        </main>
      </body>
    </html>
  );
}

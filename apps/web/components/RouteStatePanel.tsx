import type { ReactNode } from "react";

export type RouteStateTone = "error" | "loading" | "missing";

export type RouteErrorBoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

const CHECKPOINTS = ["Request", "Verify", "Approve", "Prove"] as const;

type RouteStatePanelProps = {
  actions?: ReactNode;
  description: string;
  eyebrow: string;
  note: string;
  title: string;
  titleId: string;
  tone: RouteStateTone;
};

export function RouteStatePanel({
  actions,
  description,
  eyebrow,
  note,
  title,
  titleId,
  tone,
}: RouteStatePanelProps) {
  return (
    <section
      className={`route-state-panel route-state-${tone}`}
      aria-labelledby={titleId}
      aria-live={tone === "error" ? "assertive" : tone === "loading" ? "polite" : undefined}
      aria-busy={tone === "loading" ? true : undefined}
      role={tone === "error" ? "alert" : tone === "loading" ? "status" : undefined}
    >
      <div className="route-state-header" aria-hidden="true">
        <span className="route-state-wordmark">FINAL<span>Tab</span></span>
        <span className="route-state-network">Base Sepolia / guarded state</span>
      </div>

      <div className="route-state-body">
        <p className="route-state-eyebrow">{eyebrow}</p>
        <h1 id={titleId} className="route-state-title">{title}</h1>
        <p className="route-state-description">{description}</p>

        <div className="route-state-checkpoints" aria-hidden="true">
          {CHECKPOINTS.map((checkpoint) => (
            <span className="route-state-checkpoint" key={checkpoint}>
              <span className="route-state-checkpoint-mark" />
              <span>{checkpoint}</span>
            </span>
          ))}
        </div>

        <p className="route-state-note">
          <span className="route-state-note-label">Safety state</span>
          <span className="route-state-note-copy">{note}</span>
        </p>
        {actions ? <div className="route-state-actions">{actions}</div> : null}
      </div>
    </section>
  );
}

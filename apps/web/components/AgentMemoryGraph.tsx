import Link from "next/link";
import type { SettlementAgentRunDetail } from "@/lib/agentControl";
import {
  buildAgentMemoryGraph,
  type AgentMemoryGraphNodeModel,
} from "@/lib/agentMemoryGraph";

interface Props {
  run: SettlementAgentRunDetail | null;
  hasRuns: boolean;
  firstRunId?: string;
  detailIssue?: string | null;
}

function statusTone(status: string): string {
  if (["passed", "ready", "verified", "retained"].includes(status)) {
    return "border-verified/35 bg-verified/10 text-verified";
  }
  if (["blocked", "failed"].includes(status)) {
    return "border-danger/35 bg-danger/10 text-danger";
  }
  if (["skipped", "cancelled"].includes(status)) {
    return "border-warn/35 bg-warn/10 text-warn";
  }
  return "border-info/30 bg-info/10 text-info";
}

function shortHash(value: string): string {
  return value.length > 22 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
}

function nodeKind(node: AgentMemoryGraphNodeModel): string {
  if (node.kind === "input") return "Input";
  if (node.kind === "stage") return `Stage ${String(node.event.sequence).padStart(2, "0")}`;
  if (node.kind === "evidence") return "Evidence";
  return "Memory";
}

function NodeDetail({ node }: { node: AgentMemoryGraphNodeModel }) {
  if (node.kind === "input") {
    return (
      <p className="mt-3 break-all font-mono text-xs leading-5 text-muted" title={node.inputHash}>
        {shortHash(node.inputHash)}
      </p>
    );
  }

  if (node.kind === "stage") {
    const model = node.event.modelName
      ? `${node.event.modelProvider ?? "recorded provider"}/${node.event.modelName}`
      : node.event.deterministic ? "Rules only" : "No model recorded";
    return (
      <div className="mt-3 space-y-1 font-mono text-xs leading-5 text-muted">
        <p>{model}</p>
        <p>{node.event.durationMs.toLocaleString()} ms</p>
        <p className="break-all" title={node.event.inputHash}>input {shortHash(node.event.inputHash)}</p>
      </div>
    );
  }

  if (node.kind === "evidence") {
    return (
      <div className="mt-3 space-y-1 text-xs leading-5 text-muted">
        <p className="break-words font-mono text-txt">{node.terminalCode ?? "No terminal code recorded"}</p>
        <p>{node.completedAt ? `Completed ${new Date(node.completedAt).toLocaleString()}` : "Run has not completed"}</p>
      </div>
    );
  }

  return (
    <ul className="mt-3 space-y-2" aria-label={`${node.records.length} retained memory record${node.records.length === 1 ? "" : "s"}`}>
      {node.records.map((record) => (
        <li key={record.id} className="rounded-xl border border-quiet-soft bg-canvas/45 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-xs font-semibold uppercase tracking-wide text-signal">revision {record.revision}</span>
            <span className="text-xs text-faint">expires {new Date(record.expiresAt).toLocaleDateString()}</span>
          </div>
          <p className="mt-1 break-all font-mono text-xs text-muted" title={record.contentHash}>{shortHash(record.contentHash)}</p>
          {record.sourceRunId ? (
            <Link
              href={`/app/agents/${encodeURIComponent(record.sourceRunId)}`}
              className="touch-target mt-2 inline-flex items-center text-xs font-semibold text-info hover:text-txt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
            >
              Open source run
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function AgentMemoryGraph({ run, hasRuns, firstRunId, detailIssue }: Props) {
  const graph = buildAgentMemoryGraph(run);
  const incoming = new Map(graph.edges.map((edge) => [edge.to, edge.from]));

  return (
    <section className="entry-rise mt-8 overflow-hidden rounded-3xl border border-quiet-soft bg-surface-1" aria-labelledby="agent-memory-graph-title">
      <div className="border-b border-quiet-soft px-5 py-5 sm:px-6">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-signal">Evidence lineage</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="agent-memory-graph-title" className="text-2xl font-semibold tracking-tight text-txt">Run → evidence → memory</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Every node below comes from the loaded run, its recorded stage events, or its active memory record. Missing evidence stays missing.
            </p>
          </div>
          {run ? (
            <p className="font-mono text-xs text-faint">
              {graph.eventCount} recorded stage{graph.eventCount === 1 ? "" : "s"} · {graph.memoryCount} active memory record{graph.memoryCount === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      </div>

      {graph.nodes.length === 0 ? (
        <div className="px-5 py-8 sm:px-6">
          <div className="rounded-2xl border border-dashed border-quiet bg-canvas/45 p-6">
            <h3 className="font-semibold text-txt">{hasRuns ? "Open a run to load its evidence graph" : "No run lineage yet"}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              {hasRuns
                ? detailIssue ?? "Run summaries exist, but no attested event detail is loaded in this view."
                : "Complete a signed-in four-stage review to create the first durable run, event chain, and optional memory record."}
            </p>
            {firstRunId ? (
              <Link
                href={`/app/agents/${encodeURIComponent(firstRunId)}`}
                className="touch-target mt-4 inline-flex items-center rounded-xl border border-info/35 bg-info/10 px-4 text-sm font-semibold text-info hover:bg-info/15 hover:text-txt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
              >
                Inspect latest run
              </Link>
            ) : !hasRuns ? (
              <Link
                href="/app/tab"
                className="touch-target mt-4 inline-flex items-center rounded-xl bg-signal px-4 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              >
                Open settlement room
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto px-5 py-6 sm:px-6" tabIndex={0} role="region" aria-label="Scrollable run evidence graph">
          <ol className="grid gap-3 lg:min-w-max lg:grid-flow-col lg:auto-cols-[minmax(13rem,1fr)]" aria-label={`Evidence graph for run ${graph.runId}`}>
            {graph.nodes.map((node, index) => (
              <li
                key={node.id}
                data-connected-from={incoming.get(node.id)}
                className={`entry-slide relative min-w-0 rounded-2xl border border-quiet-soft bg-surface-2 p-4 ${index > 0 ? "before:absolute before:-top-3 before:left-6 before:h-3 before:w-px before:bg-info/45 lg:before:-left-3 lg:before:top-1/2 lg:before:h-px lg:before:w-3" : ""}`}
                aria-label={`${nodeKind(node)}: ${node.label}, ${node.status}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-faint">{nodeKind(node)}</p>
                  <span className={`rounded-full border px-2 py-1 font-mono text-xs font-semibold uppercase tracking-wide ${statusTone(node.status)}`}>
                    {node.status}
                  </span>
                </div>
                <h3 className="mt-3 text-base font-semibold text-txt">{node.label}</h3>
                <NodeDetail node={node} />
                {node.kind !== "memory" ? (
                  <Link
                    href={node.href}
                    className="touch-target mt-4 inline-flex items-center text-xs font-semibold text-info hover:text-txt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
                  >
                    Inspect run evidence
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      )}

      {run && graph.memoryCount === 0 ? (
        <p className="border-t border-quiet-soft px-5 py-3 text-sm text-muted sm:px-6">
          No active bounded-memory record is attached to this run. The graph ends at the evidence actually returned by the service.
        </p>
      ) : null}
    </section>
  );
}

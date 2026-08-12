import Link from "next/link";
import type { SettlementAgentRunDetail, SettlementLineageFlow } from "@/lib/agentControl";
import {
  AGENT_GRAPH_PROVENANCE_LABELS,
  agentRunHref,
  buildAgentMemoryGraph,
  type AgentGraphFact,
  type AgentGraphProvenance,
  type AgentMemoryGraphNodeModel,
} from "@/lib/agentMemoryGraph";

interface Props {
  run: SettlementAgentRunDetail | null;
  hasRuns: boolean;
  firstRunId?: string;
  flow?: SettlementLineageFlow | null;
  detailIssue?: string | null;
  flowIssue?: string | null;
  /** The run whose page this graph is rendered on, so it never links to itself. */
  viewingRunId?: string | null;
}

function statusTone(status: string): string {
  if (["passed", "ready", "verified", "retained"].includes(status)) {
    return "border-verified/35 bg-verified/10 text-verified";
  }
  if (["blocked", "failed"].includes(status)) {
    return "border-danger/35 bg-danger/10 text-danger";
  }
  if (["skipped", "cancelled", "timeout", "unverified"].includes(status)) {
    return "border-warn/35 bg-warn/10 text-warn";
  }
  if (status === "missing") {
    return "border-quiet bg-canvas/60 text-faint";
  }
  return "border-info/30 bg-info/10 text-info";
}

const PROVENANCE_TONE: Record<AgentGraphProvenance, string> = {
  model: "border-info/30 bg-info/10 text-info",
  deterministic: "border-quiet bg-canvas/60 text-muted",
  human_wallet: "border-signal/35 bg-signal/10 text-signal",
  keeperhub: "border-quiet-soft bg-surface-1 text-txt",
  onchain: "border-verified/35 bg-verified/10 text-verified",
  memory: "border-quiet bg-canvas/60 text-muted",
};

function shortHash(value: string): string {
  return value.length > 22 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
}

function nodeKind(node: AgentMemoryGraphNodeModel): string {
  if (node.kind === "input") return "Input";
  if (node.kind === "stage") return `Stage ${String(node.event.sequence).padStart(2, "0")}`;
  if (node.kind === "evidence") return "Evidence";
  if (node.kind === "settlement") return "Settlement";
  return "Memory";
}

function Fact({ fact }: { fact: AgentGraphFact }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className="text-xs text-faint">{fact.label}</dt>
      {fact.format === "hash" ? (
        // The full value stays in the DOM so a click-to-select copies the whole
        // digest rather than the shortened form.
        <dd className="min-w-0 select-all break-all font-mono text-xs leading-5 text-muted" title={fact.value}>
          {fact.value}
        </dd>
      ) : (
        <dd className="min-w-0 break-words font-mono text-xs leading-5 text-muted">
          {fact.format === "time" ? new Date(fact.value).toLocaleString() : fact.value}
        </dd>
      )}
    </div>
  );
}

function NodeDetail({ node, runId }: { node: AgentMemoryGraphNodeModel; runId: string | null }) {
  if (node.kind === "memory" && node.records.length > 0) {
    return (
      <ul
        className="mt-3 space-y-2"
        aria-label={`${node.records.length} retained memory record${node.records.length === 1 ? "" : "s"}`}
      >
        {node.records.map((record) => (
          <li key={record.id} className="rounded-xl border border-quiet-soft bg-canvas/45 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold uppercase tracking-wide text-signal">revision {record.revision}</span>
              <span className="text-xs text-faint">expires {new Date(record.expiresAt).toLocaleDateString()}</span>
            </div>
            <p className="mt-1 break-all font-mono text-xs text-muted" title={record.contentHash}>{shortHash(record.contentHash)}</p>
            {/*
              A record carried over from an earlier run is the only one worth a
              link: linking to the run this graph already describes would just
              point back at the page the reader is on.
            */}
            {record.sourceRunId && record.sourceRunId !== runId ? (
              <Link
                href={agentRunHref(record.sourceRunId)}
                className="touch-target mt-2 inline-flex items-center text-xs font-semibold text-info hover:text-txt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
              >
                Open source run {record.sourceRunId.slice(0, 8)} · revision {record.revision}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  if (!node.recorded) {
    return <p className="mt-3 text-xs leading-5 text-faint">No evidence recorded for this step.</p>;
  }

  return (
    <dl className="mt-3 space-y-1">
      {node.facts.map((fact) => (
        <Fact key={`${fact.label}:${fact.value}`} fact={fact} />
      ))}
    </dl>
  );
}

export function AgentMemoryGraph({
  run,
  hasRuns,
  firstRunId,
  flow,
  detailIssue,
  flowIssue,
  viewingRunId = null,
}: Props) {
  const graph = buildAgentMemoryGraph(run, flow ?? null);
  const incoming = new Map(graph.edges.map((edge) => [edge.to, edge.from]));

  return (
    <section className="entry-rise mt-8 overflow-hidden rounded-3xl border border-quiet-soft bg-surface-1" aria-labelledby="agent-memory-graph-title">
      <div className="border-b border-quiet-soft px-5 py-5 sm:px-6">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-signal">Evidence lineage</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="agent-memory-graph-title" className="text-2xl font-semibold tracking-tight text-txt">Review → settlement → memory</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Every node below comes from the loaded run, its recorded stage events, its attested settlement flow, or its active memory record. Missing evidence stays missing.
            </p>
          </div>
          {run ? (
            <p className="font-mono text-xs text-faint">
              {graph.recordedCount} of {graph.nodes.length} steps evidenced · {graph.eventCount} stage{graph.eventCount === 1 ? "" : "s"} · {graph.memoryCount} memory record{graph.memoryCount === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
        {run ? (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Evidence classes used in this graph">
            {(Object.keys(AGENT_GRAPH_PROVENANCE_LABELS) as AgentGraphProvenance[]).map((provenance) => (
              <li
                key={provenance}
                className={`rounded-full border px-2 py-1 font-mono text-xs uppercase tracking-wide ${PROVENANCE_TONE[provenance]}`}
              >
                {AGENT_GRAPH_PROVENANCE_LABELS[provenance]}
              </li>
            ))}
          </ul>
        ) : null}
        {/*
          Every node of this graph belongs to one run, so the whole section needs
          one link, not one per node — and none at all when the reader is already
          on that run's page.
        */}
        {graph.runId && graph.runId !== viewingRunId ? (
          <Link
            href={agentRunHref(graph.runId)}
            className="touch-target mt-4 inline-flex items-center rounded-xl border border-info/35 bg-info/10 px-4 text-sm font-semibold text-info hover:bg-info/15 hover:text-txt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
          >
            Inspect run {graph.runId.slice(0, 8)} evidence
          </Link>
        ) : null}
        {run && flowIssue ? (
          <p className="mt-3 max-w-3xl text-sm leading-6 text-warn">
            Settlement evidence could not be read: {flowIssue}
          </p>
        ) : null}
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
        <div className="@container px-5 py-6 sm:px-6">
          {/*
            Columns are chosen from the container width, not the viewport. The
            page shell caps this section at 1800px, so viewport media queries
            kept adding columns on a container that had stopped growing — at 4K
            that produced six columns of 271px, narrower than the same card on a
            phone. The container tops out near 1686px, which is why there is no
            step past four: a fifth could never be reached, so it could never be
            verified.
          */}
          <ol
            className="grid gap-3 @min-[640px]:grid-cols-2 @min-[1000px]:grid-cols-3 @min-[1400px]:grid-cols-4"
            aria-label={`Evidence graph for run ${graph.runId}`}
          >
            {graph.nodes.map((node, index) => (
              <li
                key={node.id}
                data-connected-from={incoming.get(node.id)}
                className={`entry-slide relative min-w-0 rounded-2xl border bg-surface-2 p-4 ${node.recorded ? "border-quiet-soft" : "border-dashed border-quiet"} ${index > 0 ? "before:absolute before:-top-3 before:left-6 before:h-3 before:w-px before:bg-info/45 @min-[640px]:before:hidden" : ""}`}
                aria-label={`Step ${index + 1} of ${graph.nodes.length}, ${nodeKind(node)}: ${node.label}, ${AGENT_GRAPH_PROVENANCE_LABELS[node.provenance]} evidence, ${node.status}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-faint">
                    {String(index + 1).padStart(2, "0")} · {nodeKind(node)}
                  </p>
                  <span className={`rounded-full border px-2 py-1 font-mono text-xs font-semibold uppercase tracking-wide ${statusTone(node.status)}`}>
                    {node.status}
                  </span>
                </div>
                <h3 className={`mt-3 text-base font-semibold ${node.recorded ? "text-txt" : "text-muted"}`}>{node.label}</h3>
                <p className={`mt-2 inline-flex rounded-full border px-2 py-1 font-mono text-xs uppercase tracking-wide ${PROVENANCE_TONE[node.provenance]}`}>
                  {AGENT_GRAPH_PROVENANCE_LABELS[node.provenance]}
                </p>
                <NodeDetail node={node} runId={graph.runId} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

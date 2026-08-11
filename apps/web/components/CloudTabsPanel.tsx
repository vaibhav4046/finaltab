"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CloudOff, FolderSync, Pencil, Plus, RefreshCw, Save, Users } from "lucide-react";
import type { CloudAvailability, CloudTabSummary } from "@/lib/cloudTabs";

interface ListResponse {
  ok: boolean;
  configured?: boolean;
  tabs?: CloudTabSummary[];
  error?: string;
  message?: string;
}

function statusLabel(status: CloudTabSummary["status"]): string {
  return status.replaceAll("_", " ");
}

export function CloudTabsPanel() {
  const [availability, setAvailability] = useState<CloudAvailability>("loading");
  const [tabs, setTabs] = useState<CloudTabSummary[]>([]);
  const [title, setTitle] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setMessage(null);
    try {
      const [sessionResponse, response] = await Promise.all([
        fetch("/api/session", { cache: "no-store" }),
        fetch("/api/tabs", { cache: "no-store" }),
      ]);
      const [session, body] = await Promise.all([
        sessionResponse.json() as Promise<{ configured: boolean; authenticated: boolean }>,
        response.json() as Promise<ListResponse>,
      ]);
      if (!session.configured) {
        setAvailability("disabled");
        return;
      }
      if (!session.authenticated) {
        setAvailability("signed-out");
        return;
      }
      if (!response.ok || !body.tabs) throw new Error(body.message ?? "Could not load cloud tabs.");
      setTabs(body.tabs);
      setAvailability("ready");
    } catch (error) {
      setAvailability("error");
      setMessage(error instanceof Error ? error.message : "Could not load cloud tabs.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createTab = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/tabs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, currency }),
      });
      const body = await response.json() as { ok?: boolean; tab?: CloudTabSummary; message?: string };
      if (!response.ok || !body.tab) throw new Error(body.message ?? "The cloud draft was not created.");
      setTabs((current) => [body.tab!, ...current]);
      setTitle("");
      setMessage("Cloud draft created. Add the table before sharing an invite.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The cloud draft was not created.");
    } finally {
      setBusy(false);
    }
  };

  const saveTitle = async (tabId: string) => {
    if (!editTitle.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/tabs/${tabId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: editTitle }),
      });
      const body = await response.json() as { ok?: boolean; tab?: { title: string; updated_at: string }; message?: string };
      if (!response.ok || !body.tab) throw new Error(body.message ?? "The draft title was not updated.");
      setTabs((current) => current.map((tab) => tab.id === tabId
        ? { ...tab, title: body.tab!.title, updatedAt: body.tab!.updated_at }
        : tab));
      setEditingId(null);
      setMessage("Draft title saved to the shared tab.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The draft title was not updated.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-10" aria-labelledby="cloud-tabs-heading">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-info">Cross-device workspace</p>
          <h2 id="cloud-tabs-heading" className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-txt">Shared tab history</h2>
        </div>
        <p className="max-w-lg text-sm leading-6 text-muted">Authenticated records use owner/member policies. Invite links expire and are stored only as hashes.</p>
      </div>

      {availability === "loading" ? (
        <div className="mt-5 rounded-2xl border border-quiet-soft bg-surface-1 px-5 py-8" role="status">
          <span className="inline-flex items-center gap-2 text-sm text-muted"><RefreshCw size={16} className="animate-spin" aria-hidden="true" /> Checking cloud workspace…</span>
        </div>
      ) : null}

      {availability === "disabled" ? (
        <div className="mt-5 rounded-2xl border border-warn/30 bg-warn/5 p-5">
          <div className="flex gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-warn/10 text-warn"><CloudOff size={20} aria-hidden="true" /></span>
            <div>
              <h3 className="font-semibold text-txt">Cloud collaboration is disabled</h3>
              <p className="mt-2 text-sm leading-6 text-muted">No Supabase credentials are present, so no durable workspace is available. FINALTab will not open or claim a saved draft, invite, approval, agent run, or proof.</p>
              <Link href="/auth" className="touch-target mt-3 inline-flex items-center gap-2 rounded-lg px-1 text-sm font-semibold text-warn">View account setup <ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
          </div>
        </div>
      ) : null}

      {availability === "signed-out" ? (
        <div className="mt-5 rounded-2xl border border-quiet bg-surface-1 p-5">
          <h3 className="font-semibold text-txt">Sign in to resume shared tabs</h3>
          <p className="mt-2 text-sm text-muted">No durable workspace is available until your Supabase account is authenticated. Shared history remains private to that account.</p>
          <Link href="/auth?next=%2Fapp" className="touch-target mt-4 inline-flex items-center gap-2 rounded-xl bg-signal px-5 text-sm font-semibold text-ink">Sign in <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      ) : null}

      {availability === "error" ? (
        <div className="mt-5 rounded-2xl border border-danger/30 bg-danger/5 p-5" role="alert">
          <h3 className="font-semibold text-txt">Cloud history could not be verified</h3>
          <p className="mt-2 text-sm text-muted">{message ?? "No remote state was accepted."}</p>
          <button type="button" onClick={() => void load()} className="touch-target mt-3 inline-flex items-center gap-2 rounded-lg px-1 text-sm font-semibold text-danger"><RefreshCw size={15} aria-hidden="true" /> Try again</button>
        </div>
      ) : null}

      {availability === "ready" ? (
        <div className="mt-5 space-y-4">
          <div className="surface-shadow rounded-2xl border border-quiet-soft bg-surface-1 p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-info/10 text-info"><Plus size={20} aria-hidden="true" /></span>
              <div><h3 className="font-semibold text-txt">Create a durable draft</h3><p className="text-sm text-muted">Only the owner can rename the draft; owners and members can add the table.</p></div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_110px_auto]">
              <label className="text-sm text-muted">Tab name
                <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} placeholder="Friday dinner" className="mt-1 min-h-11 w-full rounded-xl border border-quiet bg-surface-2 px-3 text-base text-txt outline-none focus-visible:ring-2 focus-visible:ring-signal" />
              </label>
              <label className="text-sm text-muted">Currency
                <select value={currency} onChange={(event) => setCurrency(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-quiet bg-surface-2 px-3 text-base text-txt outline-none focus-visible:ring-2 focus-visible:ring-signal">
                  <option value="USD">USD</option><option value="GBP">GBP</option><option value="EUR">EUR</option>
                </select>
              </label>
              <button type="button" onClick={() => void createTab()} disabled={busy || !title.trim()} className="touch-target self-end rounded-xl bg-signal px-5 text-sm font-semibold text-ink disabled:opacity-50">{busy ? "Saving…" : "Create draft"}</button>
            </div>
          </div>

          {tabs.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-quiet-soft bg-surface-1">
              {tabs.map((tab) => (
                <article key={tab.id} className="border-b border-quiet-soft p-4 last:border-0 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      {editingId === tab.id ? (
                        <div className="flex max-w-lg gap-2">
                          <label className="sr-only" htmlFor={`cloud-title-${tab.id}`}>Shared tab title</label>
                          <input id={`cloud-title-${tab.id}`} value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={80} className="min-h-11 min-w-0 flex-1 rounded-xl border border-quiet bg-surface-2 px-3 text-base text-txt outline-none focus-visible:ring-2 focus-visible:ring-signal" />
                          <button type="button" onClick={() => void saveTitle(tab.id)} disabled={busy || !editTitle.trim()} className="touch-target inline-flex items-center gap-2 rounded-xl border border-info/40 px-3 text-sm font-semibold text-info disabled:opacity-50"><Save size={16} aria-hidden="true" /> Save</button>
                        </div>
                      ) : (
                        <>
                          <h3 className="truncate font-semibold text-txt">{tab.title}</h3>
                          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted"><span>{tab.currency}</span><span className="capitalize">{statusLabel(tab.status)}</span><span className="inline-flex items-center gap-1"><Users size={14} aria-hidden="true" /> {tab.participantCount}</span><span>{tab.role}</span></p>
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {tab.role === "owner" && editingId !== tab.id ? (
                        <button type="button" onClick={() => { setEditingId(tab.id); setEditTitle(tab.title); }} className="touch-target inline-flex items-center gap-2 rounded-xl border border-quiet px-3 text-sm text-muted hover:text-txt"><Pencil size={15} aria-hidden="true" /> Rename</button>
                      ) : null}
                      <Link href={`/app/tab?tab=${encodeURIComponent(tab.id)}`} className="touch-target inline-flex items-center gap-2 rounded-xl bg-info px-4 text-sm font-semibold text-ink">Open table <ArrowRight size={16} aria-hidden="true" /></Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-quiet bg-surface-1/70 px-6 py-10 text-center">
              <FolderSync size={24} className="mx-auto text-muted" aria-hidden="true" />
              <p className="mt-4 font-medium text-txt">No shared tabs yet</p>
              <p className="mt-2 text-sm text-muted">Create one above; it will appear on every device signed into this account.</p>
            </div>
          )}
        </div>
      ) : null}

      {message && availability === "ready" ? <p className="mt-3 text-sm text-info" role="status">{message}</p> : null}
    </section>
  );
}

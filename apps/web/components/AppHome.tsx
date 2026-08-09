"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { loadHistory, loadProfile, type Profile, type TabRecord } from "@/lib/identity";

const VERDICT_TONE: Record<TabRecord["verdict"], string> = {
  VERIFIED_SETTLED: "border-signal/40 bg-signal/10 text-signal",
  SIMULATED: "border-info/40 bg-info/10 text-info",
  FAILED: "border-danger/40 bg-danger/10 text-danger",
  DRAFT: "border-quiet bg-surface-2 text-muted",
};

function formatFiatMinor(minor: string, currency: string): string {
  const n = Number(minor);
  if (!Number.isFinite(n)) return `${currency} —`;
  const symbol = currency === "GBP" ? "£" : currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${(n / 100).toFixed(2)}`;
}

export function AppHome() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [history, setHistory] = useState<TabRecord[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    setHistory(loadHistory());
    setMounted(true);
  }, []);

  const unsettled = history.filter(
    (t) => t.verdict === "DRAFT" || t.verdict === "SIMULATED",
  );

  return (
    <>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-12 mb-24 md:mb-0">
      <header>
        <p className="font-mono text-xs tracking-[0.25em] text-signal">HOME</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          {mounted && profile ? `Welcome back, ${profile.name}.` : "Welcome to FINALTab."}
        </h1>
        <p className="mt-2 text-muted">
          Scan a receipt, agree the split, and close the tab — with a verifiable
          onchain receipt at the end.
        </p>
      </header>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Link
          href="/app/tab"
          className="group rounded-xl border border-signal/30 bg-surface-1 p-5 transition-colors hover:border-signal/60"
        >
          <p className="text-2xl">🧾</p>
          <h2 className="mt-3 font-semibold text-txt">Start a tab</h2>
          <p className="mt-1 text-sm text-muted">
            Scan → split → sign → settle. The full room.
          </p>
          <p className="mt-3 text-sm font-medium text-signal">Open →</p>
        </Link>
        <Link
          href="/app/proof"
          className="group rounded-xl border border-quiet bg-surface-1 p-5 transition-colors hover:border-signal/40"
        >
          <p className="text-2xl">🛡️</p>
          <h2 className="mt-3 font-semibold text-txt">Settlement Capsule</h2>
          <p className="mt-1 text-sm text-muted">
            The verified proof record from our live KeeperHub execution.
          </p>
          <p className="mt-3 text-sm font-medium text-signal">View →</p>
        </Link>
        <Link
          href="/lab"
          className="group rounded-xl border border-quiet bg-surface-1 p-5 transition-colors hover:border-signal/40"
        >
          <p className="text-2xl">⚗️</p>
          <h2 className="mt-3 font-semibold text-txt">Reliability Lab</h2>
          <p className="mt-1 text-sm text-muted">
            Inject real failures. Watch real checks block them.
          </p>
          <p className="mt-3 text-sm font-medium text-signal">Break it →</p>
        </Link>
      </div>

      {mounted && unsettled.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-warn">
            Unsettled
          </h2>
          <div className="mt-3 space-y-2">
            {unsettled.map((t) => (
              <Link
                key={t.id}
                href="/app/tab"
                className="flex items-center justify-between gap-4 rounded-xl border border-warn/20 bg-surface-1 px-4 py-3 transition-colors hover:border-warn/40"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-txt">{t.merchant}</p>
                  <p className="truncate text-xs text-faint">
                    {t.people.join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-mono text-sm text-txt">
                    {formatFiatMinor(t.totalMinor, t.currency)}
                  </span>
                  <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${VERDICT_TONE[t.verdict]}`}>
                    {t.verdict.toLowerCase().replace("_", " ")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
          Recent tabs
        </h2>
        {mounted && history.length > 0 ? (
          <div className="mt-3 space-y-2">
            {history.slice(0, 8).map((t) => (
              <div
                key={`${t.id}-${t.at}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-quiet bg-surface-1 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-txt">{t.merchant}</p>
                  <p className="truncate text-xs text-faint">
                    {new Date(t.at).toLocaleString()} · {t.people.join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-mono text-sm text-txt">
                    {formatFiatMinor(t.totalMinor, t.currency)}
                  </span>
                  <span className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${VERDICT_TONE[t.verdict]}`}>
                    {t.verdict.toLowerCase().replace(/_/g, " ")}
                  </span>
                  {t.txLink ? (
                    <a
                      href={t.txLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-info hover:text-txt"
                    >
                      tx ↗
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-quiet bg-surface-1/50 px-6 py-10 text-center">
            <p className="text-muted">No tabs yet on this device.</p>
            <p className="mt-1 text-sm text-faint">
              Tab history is stored locally until a server account is connected —
              we don&apos;t pretend a cloud account exists before it does.
            </p>
            <Link
              href="/app/tab"
              className="mt-4 inline-block rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-ink transition-transform hover:scale-[1.03]"
            >
              Start your first tab
            </Link>
          </div>
        )}
      </section>
      </div>
      <BottomNav />
    </>
  );
}

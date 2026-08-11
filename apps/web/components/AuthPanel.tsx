"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  loadProfile,
  saveProfile,
  clearProfile,
  loadHistory,
  makeHandle,
  type Profile,
  type TabRecord,
} from "@/lib/identity";
import { CloudAccessPanel } from "./CloudAccessPanel";

const EMOJIS = ["🧾", "🦉", "🌙", "⚡", "🪙", "🐈‍⬛", "🔥", "🫐"];

export function AuthPanel() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [history, setHistory] = useState<TabRecord[]>([]);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    setHistory(loadHistory());
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="font-mono text-xs text-fog">loading identity…</p>
      </div>
    );
  }

  const handleCreate = () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    const next: Profile = {
      name: trimmed,
      handle: makeHandle(trimmed),
      emoji,
      createdAt: new Date().toISOString(),
    };
    saveProfile(next);
    setProfile(next);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <div className="mb-5">
        <CloudAccessPanel />
      </div>
      {profile ? (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-edge bg-panel p-6"
        >
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-full border border-edge bg-panel-2 text-3xl">
              {profile.emoji}
            </span>
            <div>
              <h1 className="font-mono text-xl font-bold text-paper">{profile.name}</h1>
              <p className="font-mono text-xs text-fog">
                @{profile.handle} · since {new Date(profile.createdAt).toLocaleDateString()}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                clearProfile();
                setProfile(null);
                setName("");
              }}
              className="ml-auto rounded border border-edge px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-fog hover:border-coral hover:text-coral"
            >
              sign out
            </button>
          </div>

          <p className="mt-4 rounded border border-edge-soft bg-panel-2 p-3 font-mono text-[11px] leading-relaxed text-fog">
            This display profile stays on this device. When the cloud account above is active,
            shared drafts, membership and approval history sync separately under authenticated RLS.
          </p>

          <h2 className="mt-8 mb-3 font-mono text-[11px] uppercase tracking-wider text-fog-dim">
            Your tabs ({history.length})
          </h2>
          {history.length === 0 ? (
            <p className="font-sans text-sm text-fog">
              No tabs yet. Open the lab, drop a receipt, and settle one.
            </p>
          ) : (
            <ul className="space-y-2">
              {history.map((tab) => (
                <li
                  key={tab.id}
                  className="flex flex-wrap items-center gap-3 rounded border border-edge-soft bg-panel-2 px-4 py-3"
                >
                  <span className="font-mono text-sm font-bold text-paper">{tab.merchant}</span>
                  <span className="font-mono text-xs text-fog">
                    {(Number(tab.totalMinor) / 100).toFixed(2)} {tab.currency}
                  </span>
                  <span className="font-mono text-xs text-fog-dim">
                    {tab.people.length} people
                  </span>
                  <span
                    className={`ml-auto rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                      tab.verdict === "VERIFIED_SETTLED"
                        ? "bg-lime text-ink"
                        : tab.verdict === "FAILED"
                          ? "bg-coral text-ink"
                          : "border border-edge text-fog"
                    }`}
                  >
                    {tab.verdict}
                  </span>
                  {tab.txLink ? (
                    <a
                      href={tab.txLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] text-lime hover:underline"
                    >
                      basescan ↗
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      ) : (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-edge bg-panel p-6"
        >
          <h1 className="font-mono text-xl font-bold text-paper">Who is settling tonight?</h1>
          <p className="mt-1 font-sans text-sm text-fog">
            Pick a name and a sigil for this browser. Durable shared tabs require the separate
            cloud account above; a local profile never impersonates a server account.
          </p>

          <label className="mt-6 block font-mono text-[11px] uppercase tracking-wider text-fog-dim">
            display name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
            placeholder="vee"
            maxLength={32}
            className="mt-1 w-full rounded border border-edge bg-panel-2 px-3 py-2 font-mono text-sm text-paper outline-none focus:border-lime"
          />

          <label className="mt-4 block font-mono text-[11px] uppercase tracking-wider text-fog-dim">
            sigil
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`grid h-10 w-10 place-items-center rounded border text-xl transition ${
                  emoji === e ? "border-lime bg-panel-2" : "border-edge hover:border-fog"
                }`}
              >
                {e}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCreate}
            disabled={name.trim().length === 0}
            className="mt-6 rounded bg-lime px-5 py-2.5 font-mono text-sm font-bold uppercase tracking-wider text-ink transition hover:bg-lime-dim disabled:cursor-not-allowed disabled:opacity-40"
          >
            enter the lab
          </button>
        </motion.section>
      )}
    </div>
  );
}

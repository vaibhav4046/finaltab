"use client";

import { useState } from "react";
import { connectWallet, switchToBaseSepolia } from "@/lib/wallet";
import type { Person } from "@/lib/types";
import { CloudCollaborationPanel } from "./CloudCollaborationPanel";

interface ParticipantSetupProps {
  people: Person[];
  locked: boolean;
  cloudTabId?: string | null;
  onPeople: (people: Person[]) => void;
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function participantId(name: string) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "person";
  return `${slug}-${crypto.randomUUID().slice(0, 8)}`;
}

export function ParticipantSetup({ people, locked, cloudTabId, onPeople }: ParticipantSetupProps) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = (nextName: string, nextAddress: string) => {
    const cleanName = nextName.trim();
    const cleanAddress = nextAddress.trim();
    if (!cleanName || !ADDRESS_RE.test(cleanAddress)) {
      setError("Enter a name and a complete 0x wallet address.");
      return;
    }
    if (people.some((person) => person.address.toLowerCase() === cleanAddress.toLowerCase())) {
      setError("That wallet is already in this tab.");
      return;
    }
    onPeople([
      ...people,
      { id: participantId(cleanName), name: cleanName, address: cleanAddress.toLowerCase() as `0x${string}` },
    ]);
    setName("");
    setAddress("");
    setError(null);
  };

  const connectAndAdd = async () => {
    if (!name.trim()) {
      setError("Enter the participant's name before connecting their wallet.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const account = await connectWallet();
      if (!account) throw new Error("No wallet account was approved.");
      if (!(await switchToBaseSepolia())) throw new Error("Switch the wallet to Base Sepolia first.");
      add(name, account.address);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Wallet connection failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {cloudTabId ? <CloudCollaborationPanel tabId={cloudTabId} locked={locked} onWalletParticipants={onPeople} /> : null}
      <section className="mb-4 rounded-2xl border border-edge bg-panel p-4" aria-labelledby="participants-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-signal">Tab setup</p>
            <h2 id="participants-title" className="mt-1 text-lg font-semibold text-paper">Who is at the table?</h2>
            <p className="mt-1 max-w-2xl text-sm text-fog">
              Add the real participant wallets. Each debtor must connect the exact address listed here and approve both the USDC pull and complete payout plan.
            </p>
          </div>
          <span className="rounded-full border border-signal/30 bg-signal/10 px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-signal">
            External wallets only
          </span>
        </div>

        <ul className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {people.map((person, index) => (
            <li key={person.id} className="min-w-0 rounded-xl border border-edge-soft bg-panel-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-paper">{person.name}</p>
                  <p className="mt-1 truncate font-mono text-xs text-fog" title={person.address}>{person.address}</p>
                </div>
                <span className="rounded-full bg-signal/10 px-2 py-1 font-mono text-xs uppercase tracking-wider text-signal">
                  wallet
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <label className="sr-only" htmlFor={`participant-name-${person.id}`}>Participant {index + 1} name</label>
                <input
                  id={`participant-name-${person.id}`}
                  value={person.name}
                  disabled={locked || Boolean(cloudTabId)}
                  onChange={(event) => onPeople(people.map((item) => item.id === person.id ? { ...item, name: event.target.value } : item))}
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-edge bg-panel px-3 text-base text-paper outline-none focus-visible:ring-2 focus-visible:ring-signal"
                />
                {!cloudTabId ? (
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => onPeople(people.filter((item) => item.id !== person.id))}
                    className="min-h-11 rounded-lg border border-coral/30 px-3 text-sm text-coral disabled:opacity-40"
                    aria-label={`Remove ${person.name}`}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        {!cloudTabId ? (
          <div className="mt-4 rounded-xl border border-edge-soft p-3">
            <div className="grid gap-2 lg:grid-cols-[1fr_2fr_auto_auto]">
              <label className="text-sm text-fog">Name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Participant name"
                  disabled={locked}
                  className="mt-1 min-h-11 w-full rounded-lg border border-edge bg-panel-2 px-3 text-base text-paper outline-none focus-visible:ring-2 focus-visible:ring-signal"
                />
              </label>
              <label className="text-sm text-fog">Wallet address
                <input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="0x…"
                  spellCheck={false}
                  disabled={locked}
                  className="mt-1 min-h-11 w-full rounded-lg border border-edge bg-panel-2 px-3 font-mono text-sm text-paper outline-none focus-visible:ring-2 focus-visible:ring-signal"
                />
              </label>
              <button
                type="button"
                disabled={locked}
                onClick={() => add(name, address)}
                className="mt-6 min-h-11 rounded-lg border border-edge px-4 text-sm font-medium text-paper hover:border-signal"
              >
                Add wallet
              </button>
              <button
                type="button"
                disabled={locked || busy}
                onClick={() => void connectAndAdd()}
                className="mt-6 min-h-11 rounded-lg bg-signal px-4 text-sm font-semibold text-ink disabled:opacity-50"
              >
                {busy ? "Connecting…" : "Use connected wallet"}
              </button>
            </div>
            <p className="mt-2 text-xs text-fog">
              Adding an address does not authorize spending. At settlement, each debtor must connect that exact wallet and sign both the USDC pull and the complete payout plan.
            </p>
          </div>
        ) : null}
        {error ? <p className="mt-3 text-sm text-coral" role="alert">{error}</p> : null}
      </section>
    </>
  );
}

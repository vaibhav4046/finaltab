"use client";

import { useCallback, useEffect, useState } from "react";
import { BASE_SEPOLIA_USDC } from "@finaltab/engine";
import { clearPersistedKeys, isPersistenceEnabled } from "@/lib/demoKeys";
import type { Person } from "@/lib/types";

/**
 * Funding surface for the demo signers.
 *
 * The settle leg cannot be exercised until the debtor addresses hold Base
 * Sepolia USDC, and you cannot fund an address you cannot read. Truncated
 * `0xab12…` display is fine for the ledger view but useless for funding, so
 * this panel exposes the full address, a copy button, and a live balance so a
 * faucet transfer can be confirmed without leaving the page.
 */

const RPC_URL = "https://sepolia.base.org";
const USDC_DECIMALS = 6;

interface Balances {
  eth: bigint;
  usdc: bigint;
}

/** One JSON-RPC round trip. Throws on transport or node-level error. */
async function rpc(method: string, params: unknown[]): Promise<string> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const json = (await res.json()) as { result?: string; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  if (typeof json.result !== "string") throw new Error("RPC returned no result");
  return json.result;
}

/** ERC-20 balanceOf(address) — selector plus the address left-padded to 32 bytes. */
function balanceOfCalldata(address: string): string {
  return `0x70a08231${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

async function fetchBalances(address: string): Promise<Balances> {
  const [eth, usdc] = await Promise.all([
    rpc("eth_getBalance", [address, "latest"]),
    rpc("eth_call", [{ to: BASE_SEPOLIA_USDC, data: balanceOfCalldata(address) }, "latest"]),
  ]);
  return { eth: BigInt(eth), usdc: BigInt(usdc || "0x0") };
}

/** Render minor units without floating point, so a balance is never misreported. */
function formatUnits(value: bigint, decimals: number, maxFractionDigits: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;
  if (fraction === 0n) return whole.toString();
  const padded = fraction.toString().padStart(decimals, "0").slice(0, maxFractionDigits);
  const trimmed = padded.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole.toString();
}

function SignerRow({ person }: { person: Person }) {
  const [balances, setBalances] = useState<Balances | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBalances(await fetchBalances(person.address));
    } catch (e) {
      setError(e instanceof Error ? e.message : "balance lookup failed");
      setBalances(null);
    } finally {
      setLoading(false);
    }
  }, [person.address]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(person.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard denied — the address is selectable on screen regardless.
      setError("clipboard blocked — select the address manually");
    }
  }, [person.address]);

  const funded = balances !== null && balances.usdc > 0n;

  return (
    <div className="rounded-md border border-edge bg-panel-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-txt">{person.name}</span>
        <span
          className={`font-mono text-[9px] tracking-[0.2em] ${
            funded ? "text-signal" : "text-fog-dim"
          }`}
        >
          {funded ? "FUNDED" : "NO USDC"}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate font-mono text-[10px] text-fog">
          {person.address}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${person.name} wallet address`}
          className="min-h-11 min-w-11 shrink-0 rounded border border-edge px-2 py-1 font-mono text-[9px] text-fog transition-colors hover:border-signal/50 hover:text-signal focus:border-signal focus:outline-none"
        >
          {copied ? "COPIED" : "COPY"}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-3 font-mono text-[10px]">
        {error ? (
          <span className="text-danger">{error}</span>
        ) : loading && !balances ? (
          <span className="text-fog-dim">reading chain…</span>
        ) : balances ? (
          <>
            <span className="text-fog">
              USDC{" "}
              <span className={balances.usdc > 0n ? "text-signal" : "text-txt"}>
                {formatUnits(balances.usdc, USDC_DECIMALS, 2)}
              </span>
            </span>
            <span className="text-fog">
              ETH <span className="text-txt">{formatUnits(balances.eth, 18, 6)}</span>
            </span>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label={`Refresh ${person.name} onchain balances`}
          className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-fog-dim underline-offset-2 transition-colors hover:text-signal focus:outline-none disabled:opacity-50"
        >
          {loading ? "…" : "refresh"}
        </button>
      </div>
    </div>
  );
}

export function FundingPanel({ people }: { people: Person[] }) {
  const [persisted, setPersisted] = useState(false);

  // Read the flag after mount only. It is inlined at build time, but keeping
  // the first render identical on server and client avoids a hydration mismatch.
  useEffect(() => {
    setPersisted(isPersistenceEnabled());
  }, []);

  return (
    <section className="rounded-md border border-edge bg-panel p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] tracking-[0.25em] text-signal">DEMO SIGNER BANK</p>
          <h2 className="mt-1 text-sm font-semibold text-txt">
            Fund these addresses to exercise the live settle leg
          </h2>
        </div>
        <span
          className={`rounded border px-2 py-1 font-mono text-[9px] tracking-[0.15em] ${
            persisted
              ? "border-warn/40 bg-warn/5 text-warn"
              : "border-edge bg-panel-2 text-fog-dim"
          }`}
        >
          {persisted ? "KEYS PERSISTED" : "KEYS EPHEMERAL"}
        </span>
      </header>

      <p className="mt-2 font-mono text-[10px] leading-relaxed text-fog">
        {persisted ? (
          <>
            These signers are pinned to this browser&apos;s localStorage, so a funded address
            survives a reload. Testnet identities only — never send anything of value here.
          </>
        ) : (
          <>
            These signers are regenerated on every reload, so funding them will not survive a
            refresh. Set <code className="text-txt">NEXT_PUBLIC_FINALTAB_PERSIST_DEMO_KEYS=1</code>{" "}
            and restart to pin them, or complete the whole run without reloading.
          </>
        )}
      </p>

      <div className="mt-3 grid gap-2">
        {people.map((p) => (
          <SignerRow key={p.id} person={p} />
        ))}
      </div>

      <footer className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[10px]">
        <a
          href="https://faucet.circle.com"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex min-h-11 items-center text-signal underline underline-offset-2 hover:text-signal-dim"
        >
          Base Sepolia USDC faucet ↗
        </a>
        {persisted ? (
          <button
            type="button"
            onClick={() => {
              clearPersistedKeys();
              window.location.reload();
            }}
            className="inline-flex min-h-11 items-center text-fog-dim underline underline-offset-2 transition-colors hover:text-danger focus:outline-none"
          >
            rotate signers (drops funded addresses)
          </button>
        ) : null}
      </footer>
    </section>
  );
}

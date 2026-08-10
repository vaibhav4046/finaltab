"use client";

import { generatePrivateKey } from "viem/accounts";

/**
 * Optional persistence for the throwaway demo signers.
 *
 * Why this exists: `makeDemoPeople()` mints fresh secp256k1 keys on every page
 * load, so the debtor addresses change each reload. That is the right default —
 * the keys are disposable and hold nothing. But it makes the live settle leg
 * impossible to exercise: you cannot fund an address that will not exist after
 * the next refresh, and Base Sepolia USDC only arrives through a faucet with a
 * human in the loop.
 *
 * Turning this on pins the demo signers to localStorage so a funded address
 * survives reloads long enough to run freeze -> sign -> simulate -> execute.
 *
 * SECURITY: this writes private keys to localStorage in plaintext. That is
 * acceptable *only* for disposable Base Sepolia identities that hold testnet
 * play money. It is off unless explicitly enabled, and the UI labels it. Never
 * enable it for a build that touches real funds, and never reuse a persisted
 * address for anything of value.
 */

/** Versioned so a shape change invalidates old records instead of misreading them. */
export const DEMO_KEY_STORAGE_KEY = "finaltab.demo-signers.v1";

/** The subset of the Storage interface this module needs. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type DemoKeyMap = Record<string, `0x${string}`>;

/**
 * Off unless the flag is exactly "1". Anything else — unset, "0", "true",
 * "yes" — leaves the safe ephemeral default in place. A typo must not silently
 * start writing keys to disk.
 *
 * The default branch reads `process.env.NEXT_PUBLIC_…` as a literal member
 * expression on purpose. Next.js substitutes public env vars at build time by
 * matching that exact syntax, so aliasing `process.env` to a variable first
 * defeats the substitution and yields `undefined` in the browser bundle — the
 * flag would appear permanently off no matter what `.env.local` says.
 */
export function isPersistenceEnabled(env?: {
  NEXT_PUBLIC_FINALTAB_PERSIST_DEMO_KEYS?: string;
}): boolean {
  const raw = env
    ? env.NEXT_PUBLIC_FINALTAB_PERSIST_DEMO_KEYS
    : process.env.NEXT_PUBLIC_FINALTAB_PERSIST_DEMO_KEYS;
  return raw === "1";
}

/** A viem private key is exactly 0x + 64 lowercase-insensitive hex chars. */
export function isValidPrivateKey(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

/** localStorage if the browser gave us one, otherwise null (SSR, or blocked by policy). */
export function defaultStorage(): StorageLike | null {
  try {
    if (typeof globalThis === "undefined") return null;
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
    return ls ?? null;
  } catch {
    // Some privacy modes throw on property access rather than returning null.
    return null;
  }
}

/**
 * Read the persisted map, keeping only well-formed entries.
 *
 * A corrupt or partially-corrupt record is not an error worth surfacing — it
 * just means those signers get regenerated. Returns an empty map rather than
 * throwing so a bad localStorage value can never brick the lab.
 */
export function loadPersistedKeys(storage: StorageLike | null): DemoKeyMap {
  if (!storage) return {};
  let raw: string | null;
  try {
    raw = storage.getItem(DEMO_KEY_STORAGE_KEY);
  } catch {
    return {};
  }
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};

  const out: DemoKeyMap = {};
  for (const [id, pk] of Object.entries(parsed as Record<string, unknown>)) {
    if (isValidPrivateKey(pk)) out[id] = pk;
  }
  return out;
}

/** Write the map back. Storage failures (quota, private mode) are non-fatal. */
export function persistKeys(storage: StorageLike | null, keys: DemoKeyMap): void {
  if (!storage) return;
  try {
    storage.setItem(DEMO_KEY_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // Out of quota or storage denied. The session still works, it just will not
    // survive a reload — which is the default behaviour anyway.
  }
}

/** Drop every persisted signer. Exposed so a funded demo identity can be retired. */
export function clearPersistedKeys(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(DEMO_KEY_STORAGE_KEY);
  } catch {
    // Nothing to do — a failed clear leaves the old keys, which the caller
    // cannot recover from here.
  }
}

/**
 * Resolve one private key per id.
 *
 * Disabled (the default): every id gets a fresh key and nothing is written.
 * Enabled: valid persisted keys are reused, missing or malformed ones are
 * regenerated, and the merged map is written back so the next reload is stable.
 */
export function resolveDemoKeys(options: {
  ids: readonly string[];
  enabled?: boolean;
  storage?: StorageLike | null;
}): DemoKeyMap {
  const { ids } = options;
  const enabled = options.enabled ?? isPersistenceEnabled();

  if (!enabled) {
    const fresh: DemoKeyMap = {};
    for (const id of ids) fresh[id] = generatePrivateKey();
    return fresh;
  }

  const storage = options.storage !== undefined ? options.storage : defaultStorage();
  const persisted = loadPersistedKeys(storage);

  const resolved: DemoKeyMap = {};
  let changed = false;
  for (const id of ids) {
    const existing = persisted[id];
    if (existing) {
      resolved[id] = existing;
    } else {
      resolved[id] = generatePrivateKey();
      changed = true;
    }
  }

  // Only write when something actually changed, so a stable session does not
  // touch storage on every mount.
  if (changed) persistKeys(storage, { ...persisted, ...resolved });

  return resolved;
}

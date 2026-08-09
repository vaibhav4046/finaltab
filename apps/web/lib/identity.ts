// Device-local identity + tab history. Honest scope: this is per-device
// personalization stored in localStorage — server-side accounts land when
// Supabase credentials exist (see docs/blockers.md). No fake cloud claims.

export interface Profile {
  name: string;
  handle: string;
  emoji: string;
  createdAt: string;
}

export interface TabRecord {
  id: string;
  merchant: string;
  totalMinor: string;
  currency: string;
  people: string[];
  verdict: "DRAFT" | "SIMULATED" | "VERIFIED_SETTLED" | "FAILED";
  txLink?: string;
  at: string;
}

const PROFILE_KEY = "finaltab.profile.v1";
const HISTORY_KEY = "finaltab.history.v1";
const HISTORY_MAX = 50;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadProfile(): Profile | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Profile;
    if (typeof parsed.name !== "string" || parsed.name.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveProfile(profile: Profile): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function clearProfile(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(PROFILE_KEY);
}

export function loadHistory(): TabRecord[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TabRecord[]) : [];
  } catch {
    return [];
  }
}

export function recordTab(record: TabRecord): TabRecord[] {
  const history = loadHistory();
  const withoutSelf = history.filter((r) => r.id !== record.id);
  const next = [record, ...withoutSelf].slice(0, HISTORY_MAX);
  if (isBrowser()) {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  }
  return next;
}

export function makeHandle(name: string): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "guest";
}

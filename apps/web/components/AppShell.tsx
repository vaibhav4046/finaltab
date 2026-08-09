"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { loadProfile, type Profile } from "@/lib/identity";

type NavItem = {
  href: string;
  label: string;
  icon: (active: boolean) => ReactNode;
};

function stroke(active: boolean): string {
  return active ? "currentColor" : "currentColor";
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/app",
    label: "Home",
    icon: (a) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-5v-6h-4v6H5a1 1 0 01-1-1v-9z"
          stroke={stroke(a)}
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/app/tab",
    label: "Settle",
    icon: (a) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M6 3h12v17l-2-1.5-2 1.5-2-1.5L10 20l-2-1.5L6 20V3z"
          stroke={stroke(a)}
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path d="M9 8h6M9 12h6" stroke={stroke(a)} strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/app/proof",
    label: "Proof",
    icon: (a) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"
          stroke={stroke(a)}
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path d="M9 12l2 2 4-4.5" stroke={stroke(a)} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/lab",
    label: "Lab",
    icon: (a) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M10 3v6l-5.2 8.7A2 2 0 006.5 21h11a2 2 0 001.7-3.3L14 9V3"
          stroke={stroke(a)}
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path d="M8.5 3h7" stroke={stroke(a)} strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/auth",
    label: "Profile",
    icon: (a) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="8" r="3.5" stroke={stroke(a)} strokeWidth="1.7" />
        <path d="M5 20c1.5-3.2 4-4.5 7-4.5s5.5 1.3 7 4.5" stroke={stroke(a)} strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    setProfile(loadProfile());
  }, [pathname]);

  return (
    <div className="min-h-screen">
      {/* desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-52 flex-col border-r border-quiet/60 bg-surface-1/60 lg:flex">
        <Link href="/" className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-signal text-ink">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 8.5l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-sm font-semibold tracking-wide">FINALTab</span>
        </Link>
        <nav className="mt-2 flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-surface-2 text-signal"
                    : "text-muted hover:bg-surface-2/60 hover:text-txt"
                }`}
              >
                {item.icon(active)}
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-quiet/60 px-5 py-4">
          <Link href="/auth" className="flex items-center gap-2.5 text-sm text-muted transition-colors hover:text-txt">
            <span className="text-base">{profile ? profile.emoji : "○"}</span>
            <span className="truncate">{profile ? profile.name : "Sign in"}</span>
          </Link>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-faint">
            Base Sepolia · USDC
          </p>
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-40 flex h-12 items-center justify-between border-b border-quiet/60 bg-canvas/90 px-4 backdrop-blur-md lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-signal text-ink">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3 8.5l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-sm font-semibold">FINALTab</span>
        </Link>
        <Link href="/auth" className="flex items-center gap-1.5 text-sm text-muted">
          {profile ? (
            <>
              <span>{profile.emoji}</span>
              <span className="max-w-[100px] truncate text-txt">{profile.name}</span>
            </>
          ) : (
            <span>Sign in</span>
          )}
        </Link>
      </header>

      <main className="pb-20 lg:pb-0 lg:pl-52">{children}</main>

      {/* mobile bottom nav */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-quiet/60 bg-surface-1/95 backdrop-blur-md lg:hidden">
        <div className="grid grid-cols-5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                  active ? "text-signal" : "text-faint hover:text-muted"
                }`}
              >
                {item.icon(active)}
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

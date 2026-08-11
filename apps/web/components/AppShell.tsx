"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileCheck2,
  FlaskConical,
  House,
  ScanLine,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { FinalTabMark } from "./FinalTabMark";
import { loadProfile, type Profile } from "@/lib/identity";

type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "Home", shortLabel: "Home", icon: House },
  { href: "/app/tab", label: "New settlement", shortLabel: "Settle", icon: ScanLine },
  { href: "/app/proof", label: "Reference proof", shortLabel: "Proof", icon: FileCheck2 },
  { href: "/lab", label: "Reliability lab", shortLabel: "Lab", icon: FlaskConical },
  { href: "/auth", label: "Local profile", shortLabel: "Profile", icon: UserRound },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ShellMark() {
  return <FinalTabMark />;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    setProfile(loadProfile());
  }, [pathname]);

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="min-h-dvh bg-canvas">
      <a href="#app-main" className="skip-link">Skip to workspace</a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-quiet-soft bg-surface-1/94 backdrop-blur-xl lg:flex">
        <div className="border-b border-quiet-soft px-4 py-4">
          <Link href="/" className="touch-target flex items-center gap-3 rounded-xl px-1" aria-label="FINALTab public home">
            <ShellMark />
            <div>
              <p className="text-[15px] font-semibold tracking-[-0.02em] text-txt">FINAL<span className="text-signal">Tab</span></p>
              <p className="font-mono text-xs text-faint">night-service ledger</p>
            </div>
          </Link>
        </div>

        <div className="px-4 pt-5">
          <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-warn/30 bg-warn/10 px-3 font-mono text-xs font-semibold uppercase tracking-wide text-warn">
            <span className="h-2 w-2 rounded-full bg-warn" aria-hidden="true" /> Testnet preview
          </span>
        </div>

        <nav className="mt-5 flex flex-1 flex-col gap-1.5 px-3" aria-label="Workspace navigation">
          <p className="px-3 pb-1 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-faint">Workspace</p>
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`touch-target flex items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors duration-200 ${
                  active
                    ? "bg-signal/12 text-signal"
                    : "text-muted hover:bg-surface-2 hover:text-txt"
                }`}
              >
                <Icon size={19} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                <span>{item.label}</span>
                {active ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-quiet-soft p-3">
          <Link href="/auth" className="touch-target flex items-center gap-3 rounded-xl px-3 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-txt">
            <span className="grid h-8 w-8 place-items-center rounded-full border border-quiet bg-surface-2 text-base" aria-hidden="true">
              {profile ? profile.emoji : <UserRound size={16} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-txt">{profile ? profile.name : "Local profile"}</span>
              <span className="block truncate text-xs text-faint">Stored on this device</span>
            </span>
          </Link>
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between gap-3 border-b border-quiet-soft bg-canvas/90 px-4 backdrop-blur-xl lg:hidden">
        <Link href="/" className="touch-target flex items-center gap-2.5 rounded-lg" aria-label="FINALTab public home">
          <ShellMark />
          <span className="text-sm font-semibold text-txt">FINAL<span className="text-signal">Tab</span></span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden min-h-8 items-center rounded-full border border-warn/30 bg-warn/10 px-2.5 font-mono text-xs font-semibold text-warn min-[390px]:inline-flex">
            TESTNET
          </span>
          <Link href="/auth" className="touch-target inline-flex max-w-36 items-center gap-2 rounded-xl px-2 text-sm text-muted transition-colors hover:bg-surface-1 hover:text-txt" aria-label={profile ? `Local profile for ${profile.name}` : "Open local profile"}>
            <span className="grid h-8 w-8 place-items-center rounded-full border border-quiet bg-surface-1 text-base" aria-hidden="true">
              {profile ? profile.emoji : <UserRound size={16} />}
            </span>
            <span className="hidden max-w-20 truncate sm:block">{profile ? profile.name : "Profile"}</span>
          </Link>
        </div>
      </header>

      <main
        ref={mainRef}
        id="app-main"
        tabIndex={-1}
        className="min-h-dvh pb-24 outline-none lg:pb-0 lg:pl-60"
      >
        {children}
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-quiet-soft bg-surface-1/96 backdrop-blur-xl lg:hidden" aria-label="Mobile workspace navigation">
        <div className="grid grid-cols-5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[68px] flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-medium transition-colors duration-200 ${
                  active ? "bg-signal/8 text-signal" : "text-faint hover:bg-surface-2 hover:text-muted"
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.3 : 1.8} aria-hidden="true" />
                <span>{item.shortLabel}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

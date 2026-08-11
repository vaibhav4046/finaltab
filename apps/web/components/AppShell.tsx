"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  FileCheck2,
  House,
  ScanLine,
  UserRound,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "Home", shortLabel: "Home", icon: House },
  { href: "/app/tab", label: "New settlement", shortLabel: "Settle", icon: ScanLine },
  { href: "/app/agents", label: "Agents / Memory", shortLabel: "Agents", icon: Bot },
  { href: "/app/proof", label: "Proofs", shortLabel: "Proofs", icon: FileCheck2 },
  { href: "/auth", label: "Account", shortLabel: "Account", icon: UserRound },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="app-shell min-h-dvh bg-canvas">
      <a href="#app-main" className="skip-link">Skip to workspace</a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-quiet-soft bg-canvas/96 backdrop-blur-xl lg:flex">
        <div className="border-b border-quiet-soft px-4 py-4">
          <Link href="/" className="touch-target flex items-center rounded-xl px-1" aria-label="FINALTab public home">
            <div>
              <p className="text-[18px] font-semibold tracking-[-0.035em] text-txt">FINAL<span className="text-signal">Tab</span></p>
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-faint">settlement workspace</p>
            </div>
          </Link>
        </div>

        <div className="px-4 pt-5">
          <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-info/30 bg-info/10 px-3 font-mono text-xs font-semibold uppercase tracking-wide text-info">
            <span className="h-2 w-2 rounded-full bg-info" aria-hidden="true" /> Base Sepolia
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
                    ? "bg-signal text-ink"
                    : "text-muted hover:bg-surface-2 hover:text-signal"
                }`}
              >
                <Icon size={19} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                <span>{item.label}</span>
                {active ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-ink" aria-hidden="true" /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-quiet-soft p-3">
          <Link href="/auth" className="touch-target flex items-center gap-3 rounded-xl px-3 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-txt">
            <span className="grid h-8 w-8 place-items-center rounded-full border border-quiet bg-surface-2 text-base" aria-hidden="true">
              <UserRound size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-txt">Account</span>
              <span className="block truncate text-xs text-faint">Supabase + Privy</span>
            </span>
          </Link>
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between gap-3 border-b border-quiet-soft bg-canvas/90 px-4 backdrop-blur-xl lg:hidden">
        <Link href="/" className="touch-target flex items-center rounded-lg" aria-label="FINALTab public home">
          <span className="text-[17px] font-semibold tracking-[-0.035em] text-txt">FINAL<span className="text-signal">Tab</span></span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="hidden min-h-8 items-center rounded-full border border-info/30 bg-info/10 px-2.5 font-mono text-xs font-semibold text-info min-[390px]:inline-flex">
            TESTNET
          </span>
          <Link href="/auth" className="touch-target inline-flex max-w-36 items-center gap-2 rounded-xl px-2 text-sm text-muted transition-colors hover:bg-surface-1 hover:text-txt" aria-label="Open account">
            <span className="grid h-8 w-8 place-items-center rounded-full border border-quiet bg-surface-1 text-base" aria-hidden="true">
              <UserRound size={16} />
            </span>
            <span className="hidden max-w-20 truncate sm:block">Account</span>
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
                  active ? "bg-signal/10 text-signal" : "text-faint hover:bg-surface-2 hover:text-muted"
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

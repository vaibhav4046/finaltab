"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, FileCheck2, House, ScanLine, UserRound } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "Home", icon: <House size={20} aria-hidden="true" /> },
  { href: "/app/tab", label: "Settle", icon: <ScanLine size={20} aria-hidden="true" /> },
  { href: "/app/agents", label: "Agents", icon: <Bot size={20} aria-hidden="true" /> },
  { href: "/app/proof", label: "Proof", icon: <FileCheck2 size={20} aria-hidden="true" /> },
  { href: "/auth", label: "Account", icon: <UserRound size={20} aria-hidden="true" /> },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-quiet-soft bg-surface-1/96 backdrop-blur-xl lg:hidden" aria-label="Mobile workspace navigation">
      <div className="grid grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-[68px] flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-medium transition-colors ${
                isActive ? "bg-signal/10 text-signal" : "text-faint hover:bg-surface-2 hover:text-muted"
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

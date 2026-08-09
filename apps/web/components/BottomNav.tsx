"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FileText, HelpCircle, Settings } from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/app", label: "Home", icon: <Home size={24} /> },
  { href: "/app/tab", label: "Settle", icon: <FileText size={24} /> },
  { href: "/app/lab", label: "Lab", icon: <HelpCircle size={24} /> },
  { href: "/auth", label: "Profile", icon: <Settings size={24} /> },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-edge bg-panel md:hidden">
      <div className="flex h-20 items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 py-2 px-3 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                isActive ? "text-signal" : "text-fog hover:text-paper"
              }`}
            >
              <span className={isActive ? "text-signal" : "text-fog"}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { PrivyRouteProvider } from "@/components/PrivyRouteProvider";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <PrivyRouteProvider><AppShell>{children}</AppShell></PrivyRouteProvider>;
}

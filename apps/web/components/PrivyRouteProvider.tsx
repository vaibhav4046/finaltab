import type { ReactNode } from "react";
import { privyServerConfig } from "@/lib/privy/server";
import { FinalTabPrivyProvider } from "./PrivyAuthProvider";

/** Mount the wallet SDK only when the complete optional bridge is configured. */
export function PrivyRouteProvider({ children }: { children: ReactNode }) {
  const privy = privyServerConfig();
  return (
    <FinalTabPrivyProvider
      appId={privy?.appId}
      clientId={privy?.clientId}
      apiUrl={privy?.apiUrl}
    >
      {children}
    </FinalTabPrivyProvider>
  );
}

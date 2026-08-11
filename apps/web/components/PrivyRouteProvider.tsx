import type { ReactNode } from "react";
import { privyPublicConfig } from "@/lib/privy/config";
import { FinalTabPrivyProvider } from "./PrivyAuthProvider";

/** Mount the wallet SDK only inside authenticated/account route boundaries. */
export function PrivyRouteProvider({ children }: { children: ReactNode }) {
  const privy = privyPublicConfig();
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

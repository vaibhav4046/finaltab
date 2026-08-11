import { authFeatureFlags } from "@/lib/auth/features";
import { privyServerConfig } from "@/lib/privy/server";
import { CloudAccessPanel, type AuthMode } from "./CloudAccessPanel";

export function AuthPanel({ initialMode = "sign-in" }: { initialMode?: AuthMode }) {
  const privyConfigured = Boolean(privyServerConfig());
  const { githubOAuthEnabled, teamEmailAuthEnabled } = authFeatureFlags();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6">
      <header className="mb-6">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-signal">FINALTab / Account</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-paper">
          {githubOAuthEnabled ? "One real account. GitHub-secured." : "One real account. Supabase-secured."}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fog">
          {githubOAuthEnabled
            ? "GitHub OAuth establishes your durable Supabase identity and Row Level Security boundary."
            : "Public GitHub sign-in is disabled on this deployment; no local identity is substituted."}
          {teamEmailAuthEnabled
            ? " A separately gated email fallback is available only where the deployment operator has verified delivery."
            : " Public email delivery is not advertised or assumed."}
          {privyConfigured
            ? " The optional Privy bridge can provision a linked wallet identity, but never grants settlement authority."
            : " External-wallet settlement signatures are verified separately and never grant database authority."}
        </p>
      </header>
      <CloudAccessPanel
        initialMode={initialMode}
        githubOAuthEnabled={githubOAuthEnabled}
        teamEmailAuthEnabled={teamEmailAuthEnabled}
        privyConfigured={privyConfigured}
      />
    </div>
  );
}

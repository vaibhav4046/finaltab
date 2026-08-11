import { CloudAccessPanel, type AuthMode } from "./CloudAccessPanel";

export function AuthPanel({ initialMode = "sign-in" }: { initialMode?: AuthMode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6">
      <header className="mb-6">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-signal">FINALTab / Account</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-paper">One real account. One verified provisioning bridge.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fog">
          Email authentication establishes your durable Supabase identity. Privy can provision a linked wallet identity,
          but this release still requires external-wallet settlement signatures and never grants Privy settlement authority.
        </p>
      </header>
      <CloudAccessPanel initialMode={initialMode} />
    </div>
  );
}

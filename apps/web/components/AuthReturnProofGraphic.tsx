export type AuthProofState = "verified" | "pending" | "error";

const PROOF_LABEL: Record<AuthProofState, string> = {
  verified: "IDENTITY PROOF",
  pending: "VERIFYING RETURN",
  error: "RETURN BLOCKED",
};

/** A local, dependency-free receipt proof for every identity return state. */
export function AuthReturnProofGraphic({ state }: { state: AuthProofState }) {
  const verified = state === "verified";
  const failed = state === "error";
  const accent = failed ? "#FF6B6B" : verified ? "#B7FF3C" : "#42D6FF";

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[300px]" aria-hidden="true">
      <div
        className={`absolute inset-[12%] rounded-full blur-3xl ${
          failed ? "bg-danger/10" : verified ? "bg-signal/10" : "animate-pulse bg-blue-500/10"
        }`}
      />
      <svg viewBox="0 0 320 320" className="relative h-full w-full" role="presentation">
        <defs>
          <linearGradient id={`auth-receipt-edge-${state}`} x1="36" y1="24" x2="284" y2="296" gradientUnits="userSpaceOnUse">
            <stop stopColor={accent} />
            <stop offset="0.54" stopColor="#42D6FF" />
            <stop offset="1" stopColor="#145CFF" />
          </linearGradient>
          <linearGradient id={`auth-receipt-fill-${state}`} x1="94" y1="58" x2="238" y2="272" gradientUnits="userSpaceOnUse">
            <stop stopColor="#111814" />
            <stop offset="1" stopColor="#060A08" />
          </linearGradient>
          <filter id={`auth-receipt-glow-${state}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx="160" cy="160" r="132" fill="none" stroke="#173226" strokeWidth="1" strokeDasharray="3 9" />
        <circle cx="160" cy="160" r="108" fill="none" stroke="#174D79" strokeWidth="1" opacity="0.7" />
        <path
          d="M83 55c0-9 7-16 16-16h122c9 0 16 7 16 16v209l-15-9-15 9-16-9-16 9-15-9-15 9-16-9-15 9-15-9-16 9V55Z"
          fill={`url(#auth-receipt-fill-${state})`}
          stroke={`url(#auth-receipt-edge-${state})`}
          strokeWidth="2"
        />
        <text x="112" y="83" fill="#EAF4ED" fontSize="16" fontWeight="700" letterSpacing="1.4">FINALTab</text>
        <path d="M111 107h98M111 125h62M111 143h84" stroke="#52655B" strokeWidth="5" strokeLinecap="round" />
        <path d="M111 177h98" stroke="#244537" strokeWidth="1" strokeDasharray="4 5" />
        <circle
          cx="160"
          cy="213"
          r="32"
          fill="#0B1711"
          stroke={accent}
          strokeWidth="2"
          filter={`url(#auth-receipt-glow-${state})`}
          strokeDasharray={state === "pending" ? "8 7" : undefined}
        />
        {verified ? (
          <path d="m145 213 10 10 21-23" fill="none" stroke={accent} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        ) : failed ? (
          <path d="m149 202 22 22m0-22-22 22" fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round" />
        ) : (
          <path d="M160 197v18l12 7" fill="none" stroke={accent} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        )}
        <text x="160" y="264" textAnchor="middle" fill={failed ? accent : "#42D6FF"} fontSize="10" fontWeight="700" letterSpacing="2.5">
          {PROOF_LABEL[state]}
        </text>
      </svg>
    </div>
  );
}

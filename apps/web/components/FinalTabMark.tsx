interface FinalTabMarkProps {
  className?: string;
}

/** A receipt + two-way settlement rail, drawn for FINALTab rather than sourced from an icon set. */
export function FinalTabMark({ className = "h-8 w-8" }: FinalTabMarkProps) {
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-[10px] border border-signal/45 bg-signal text-ink shadow-[0_8px_24px_-12px_rgba(255,147,106,0.9)] ${className}`}
      aria-hidden="true"
      data-finaltab-mark
    >
      <svg viewBox="0 0 24 24" className="h-[68%] w-[68%]" fill="none" role="presentation">
        <path
          className="mark-receipt"
          d="M5.25 3.25h13.5v16.2l-2.25-1.3-2.25 1.3-2.25-1.3-2.25 1.3-2.25-1.3-2.25 1.3V3.25Z"
          fill="currentColor"
          fillOpacity="0.12"
          stroke="currentColor"
          strokeWidth="1.45"
          strokeLinejoin="round"
        />
        <path className="mark-route mark-route-out" d="M8 8h7.8m0 0-1.8-1.7M15.8 8 14 9.7" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
        <path className="mark-route mark-route-back" d="M16 13H8.2m0 0 1.8-1.7M8.2 13l1.8 1.7" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
        <circle className="mark-node mark-node-first" cx="8" cy="8" r="1" fill="currentColor" />
        <circle className="mark-node mark-node-last" cx="16" cy="13" r="1" fill="currentColor" />
      </svg>
      <span className="absolute -bottom-2 -right-2 h-4 w-4 rotate-45 bg-paper/75" />
    </span>
  );
}

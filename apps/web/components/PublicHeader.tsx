import Link from "next/link";

/** Shared header for public pages (/developers, /open-source). */
export function PublicHeader({ active }: { active: "developers" | "open-source" }) {
  return (
    <header className="public-header sticky top-0 z-40 border-b border-quiet-soft bg-canvas/92 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="touch-target flex items-center rounded-lg text-[17px] font-semibold tracking-[-0.035em] text-txt" aria-label="FINALTab home">
          <span>FINAL<span className="text-signal">Tab</span></span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Public navigation">
          <Link
            href="/developers"
            aria-current={active === "developers" ? "page" : undefined}
            className={`touch-target hidden items-center rounded-lg px-3 text-sm transition-colors duration-200 hover:bg-surface-1 hover:text-txt sm:inline-flex ${
              active === "developers" ? "bg-surface-1 text-signal" : "text-muted"
            }`}
          >
            Developers
          </Link>
          <Link
            href="/open-source"
            aria-current={active === "open-source" ? "page" : undefined}
            className={`touch-target hidden items-center rounded-lg px-3 text-sm transition-colors duration-200 hover:bg-surface-1 hover:text-txt sm:inline-flex ${
              active === "open-source" ? "bg-surface-1 text-signal" : "text-muted"
            }`}
          >
            Open source
          </Link>
          <Link
            href="/app"
            className="touch-target inline-flex items-center rounded-xl bg-signal px-4 text-sm font-semibold text-ink transition-[transform,background-color] duration-200 hover:bg-signal-dim active:scale-[0.98]"
          >
            Open settlement workspace
          </Link>
        </nav>
      </div>
    </header>
  );
}

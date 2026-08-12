import Link from "next/link";

/** Shared header for public pages (/developers, /open-source). */
export function PublicHeader({ active }: { active: "developers" | "open-source" }) {
  return (
    <header className="public-header sticky top-0 z-40 border-b border-quiet bg-canvas/94 backdrop-blur-xl">
      <a href="#public-main" className="skip-link">Skip to content</a>
      <div className="mx-auto flex min-h-16 max-w-[90rem] flex-wrap items-center justify-between gap-x-3 px-4 py-2 sm:flex-nowrap sm:px-6 sm:py-0 lg:px-10">
        <Link href="/" className="touch-target flex items-center rounded-lg text-lg font-semibold tracking-[-0.045em] text-txt" aria-label="FINALTab home">
          <span>FINAL<span className="text-signal">Tab</span></span>
        </Link>
        <nav className="order-3 mt-2 flex w-full items-center border-t border-quiet-soft pt-2 sm:order-none sm:mt-0 sm:w-auto sm:flex-1 sm:justify-end sm:border-0 sm:pt-0" aria-label="Public navigation">
          <Link
            href="/developers"
            aria-current={active === "developers" ? "page" : undefined}
            className={`touch-target inline-flex flex-1 items-center justify-center border-b px-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] transition-colors duration-200 hover:text-txt sm:flex-none sm:border-b-0 ${
              active === "developers" ? "border-signal text-signal sm:bg-surface-1" : "border-transparent text-muted"
            }`}
          >
            Developers
          </Link>
          <Link
            href="/open-source"
            aria-current={active === "open-source" ? "page" : undefined}
            className={`touch-target inline-flex flex-1 items-center justify-center border-b px-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] transition-colors duration-200 hover:text-txt sm:flex-none sm:border-b-0 ${
              active === "open-source" ? "border-signal text-signal sm:bg-surface-1" : "border-transparent text-muted"
            }`}
          >
            Open source
          </Link>
        </nav>
        <Link
          href="/app"
          className="touch-target order-2 inline-flex items-center rounded-lg bg-signal px-3 text-sm font-semibold text-ink transition-[transform,background-color] duration-200 hover:bg-signal-dim active:scale-[0.98] sm:order-none sm:px-4"
        >
          <span className="sm:hidden">Workspace</span>
          <span className="hidden sm:inline">Open workspace</span>
        </Link>
      </div>
    </header>
  );
}

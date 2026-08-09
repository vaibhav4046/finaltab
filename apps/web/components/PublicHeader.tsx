import Link from "next/link";

/** Shared header for public pages (/developers, /open-source). */
export function PublicHeader({ active }: { active: "developers" | "open-source" }) {
  return (
    <header className="sticky top-0 z-40 border-b border-quiet bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="font-mono text-sm font-bold tracking-widest text-paper">
          FINAL<span className="text-signal">Tab</span>
        </Link>
        <nav className="flex items-center gap-4 sm:gap-6" aria-label="Public navigation">
          <Link
            href="/developers"
            className={`font-mono text-xs uppercase tracking-wider transition-colors hover:text-paper ${
              active === "developers" ? "text-signal" : "text-muted"
            }`}
          >
            Developers
          </Link>
          <Link
            href="/open-source"
            className={`font-mono text-xs uppercase tracking-wider transition-colors hover:text-paper ${
              active === "open-source" ? "text-signal" : "text-muted"
            }`}
          >
            Open source
          </Link>
          <Link
            href="/app"
            className="rounded-md bg-signal px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-ink transition-opacity hover:opacity-90"
          >
            Open the app
          </Link>
        </nav>
      </div>
    </header>
  );
}

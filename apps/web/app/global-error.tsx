"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="grid min-h-dvh place-items-center bg-[#050706] px-4 py-12 font-sans text-[#f4f8f1]">
        <main className="w-full max-w-2xl rounded-2xl border border-[#344238] bg-[#0a0d0b] p-6 sm:p-9">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#45afff]">FINALTab / Recovery</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em]">FINALTab could not open.</h1>
          <p className="mt-4 text-sm leading-6 text-[#b7c0b8]">The application stopped before it could establish a trustworthy view. Reload it; no success state is assumed.</p>
          <button type="button" onClick={reset} className="mt-6 min-h-11 rounded-xl bg-[#c8ff3d] px-5 text-sm font-semibold text-[#050706]">Reload FINALTab</button>
        </main>
      </body>
    </html>
  );
}

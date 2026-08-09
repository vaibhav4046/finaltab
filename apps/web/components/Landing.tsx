"use client";

import { useRef } from "react";
import Link from "next/link";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useScroll,
  useReducedMotion,
} from "framer-motion";

const TX_LINK =
  "https://sepolia.basescan.org/tx/0x11300427473e95d241d924891b2cc0131b0047263e461787c27a2f854c39278c";

const PIPELINE = [
  ["01", "Photograph", "Groq vision reads the receipt into strict JSON. Decimal strings in, integer minor units out. Floats never touch money."],
  ["02", "Speak", "“Vee had the daal, split the rest evenly.” The model proposes. The deterministic engine decides — every proposal re-reconciled to the cent."],
  ["03", "Split", "Largest-remainder allocation. Shares always sum to the receipt total. Always."],
  ["04", "Net", "The debt graph collapses to the minimum set of transfers before anyone signs."],
  ["05", "Freeze", "The ledger becomes a keccak256 hash. Edit anything after signing and every signature dies by construction."],
  ["06", "Sign", "Each debtor signs one gasless USDC authorization (EIP-3009). No approvals. No allowances. No debtor gas."],
  ["07", "Settle + verify", "KeeperHub simulates first — a failed simulation is never broadcast. VERIFIED_SETTLED appears only when the chain returns a verified receipt."],
] as const;

const TICKER = [
  "SIMULATE FIRST",
  "NO FLOATS ON MONEY",
  "CENT-PERFECT SPLITS",
  "ONE ATOMIC BATCH",
  "GASLESS FOR DEBTORS",
  "RECEIPTS OR IT DIDN'T HAPPEN",
  "VERIFIED_SETTLED",
];

function TiltReceipt() {
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(my, [0, 1], [14, -14]), { stiffness: 150, damping: 20 });
  const rotateY = useSpring(useTransform(mx, [0, 1], [-18, 18]), { stiffness: 150, damping: 20 });

  return (
    <div
      ref={ref}
      className="relative [perspective:1200px]"
      onMouseMove={(e) => {
        if (prefersReduced || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width);
        my.set((e.clientY - r.top) / r.height);
      }}
      onMouseLeave={() => {
        mx.set(0.5);
        my.set(0.5);
      }}
    >
      <motion.div
        style={prefersReduced ? undefined : { rotateX, rotateY, transformStyle: "preserve-3d" }}
        animate={prefersReduced ? undefined : { y: [0, -10, 0] }}
        transition={{ y: { duration: 6, repeat: Infinity, ease: "easeInOut" } }}
        className="receipt-paper relative w-[300px] rotate-2 px-5 pb-2 pt-5 font-mono text-[12px] sm:w-[330px]"
      >
        <div style={{ transform: "translateZ(30px)" }}>
          <p className="text-center text-[13px] font-bold tracking-widest">DISHOOM</p>
          <p className="text-center text-[10px] text-ink-soft">demo receipt · table 12 · 3 people</p>
          <div className="my-2 border-t border-dashed border-ink-soft/40" />
          {[
            ["HOUSE BLACK DAAL", "8.90"],
            ["CHICKEN RUBY", "12.70"],
            ["GARLIC NAAN ×2", "9.00"],
            ["GUNPOWDER POTATOES", "8.20"],
            ["CHAI ×3", "9.60"],
          ].map(([item, amt]) => (
            <p key={item} className="flex">
              <span>{item}</span>
              <span className="leader" />
              <span>{amt}</span>
            </p>
          ))}
          <div className="my-2 border-t border-dashed border-ink-soft/40" />
          <p className="flex">
            <span>SERVICE 12.5%</span>
            <span className="leader" />
            <span>5.60</span>
          </p>
          <p className="flex text-[14px] font-bold">
            <span>TOTAL</span>
            <span className="leader" />
            <span>54.00</span>
          </p>
          <div className="my-2 border-t border-dashed border-ink-soft/40" />
          <p className="text-center text-[10px] text-ink-soft">keccak256(ledger) → EIP-3009 → one batch</p>
          <motion.p
            initial={{ opacity: 0, scale: 1.6, rotate: -14 }}
            whileInView={{ opacity: 1, scale: 1, rotate: -8 }}
            viewport={{ once: true }}
            transition={{ delay: 0.6, type: "spring", stiffness: 200, damping: 14 }}
            className="pointer-events-none mx-auto mt-3 w-fit border-[3px] border-lime-dim px-2 py-0.5 text-center text-[13px] font-black tracking-widest text-lime-dim"
            style={{ transform: "translateZ(60px)" }}
          >
            VERIFIED_SETTLED
          </motion.p>
        </div>
        <div className="receipt-tear absolute -bottom-[10px] left-0 w-full" />
      </motion.div>
    </div>
  );
}

export function Landing() {
  const { scrollYProgress } = useScroll();
  const heroFade = useTransform(scrollYProgress, [0, 0.18], [1, 0]);

  return (
    <div className="relative overflow-x-clip">
      {/* nav */}
      <nav className="sticky top-0 z-40 border-b border-edge-soft bg-night/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
          <span className="font-mono text-base font-bold tracking-tight text-paper">
            FINAL<span className="text-lime">Tab</span>
          </span>
          <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-wider">
            <a href="#pipeline" className="hidden text-fog hover:text-paper sm:inline">pipeline</a>
            <a href="#proof" className="hidden text-fog hover:text-paper sm:inline">proof</a>
            <a href="#mcp" className="hidden text-fog hover:text-paper sm:inline">mcp</a>
            <Link href="/auth" className="text-fog hover:text-paper">sign in</Link>
            <Link
              href="/app"
              className="rounded bg-lime px-3 py-1.5 font-bold text-ink transition hover:bg-lime-dim"
            >
              open the lab
            </Link>
          </div>
        </div>
      </nav>

      {/* hero */}
      <section className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 pb-20 pt-16 md:grid-cols-[1.2fr_1fr] md:px-6 md:pt-24">
        <motion.div style={{ opacity: heroFade }}>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-mono text-[11px] uppercase tracking-[0.25em] text-fog"
          >
            Base Sepolia · USDC · KeeperHub execution
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="mt-4 font-mono text-[clamp(2.4rem,6vw,4.6rem)] font-black leading-[0.95] tracking-tight text-paper"
          >
            SETTLE THE
            <br />
            TABLE.
            <br />
            <span className="text-lime">PROVE IT</span>
            <br />
            ONCHAIN.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
            className="mt-6 max-w-md font-sans text-base leading-relaxed text-fog"
          >
            Split a real receipt in plain English. Settle it as one atomic USDC batch.
            And never, ever see the word &ldquo;settled&rdquo; until the chain proves it landed.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24 }}
            className="mt-8 flex flex-wrap gap-3"
          >
            <Link
              href="/app"
              className="rounded bg-lime px-6 py-3 font-mono text-sm font-bold uppercase tracking-wider text-ink transition hover:bg-lime-dim"
            >
              split a receipt →
            </Link>
            <a
              href="#proof"
              className="rounded border border-edge px-6 py-3 font-mono text-sm uppercase tracking-wider text-fog transition hover:border-lime hover:text-lime"
            >
              see the proof
            </a>
          </motion.div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="mx-auto"
        >
          <TiltReceipt />
        </motion.div>
      </section>

      {/* ticker */}
      <div className="overflow-hidden border-y border-edge-soft bg-panel py-3">
        <div className="ticker flex w-max gap-8 font-mono text-[11px] uppercase tracking-[0.2em] text-fog">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={`${t}-${i}`} className="flex items-center gap-8">
              <span className={t === "VERIFIED_SETTLED" ? "text-lime" : undefined}>{t}</span>
              <span className="text-edge">✦</span>
            </span>
          ))}
        </div>
      </div>

      {/* pipeline */}
      <section id="pipeline" className="mx-auto max-w-6xl px-4 py-20 md:px-6">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-fog">
          The pipeline
        </h2>
        <p className="mt-2 max-w-lg font-mono text-2xl font-bold text-paper">
          Seven steps. Zero trust in a model. Zero trust in a bare tx hash.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-2">
          {PIPELINE.map(([num, title, body], i) => (
            <motion.div
              key={num}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: (i % 2) * 0.08 }}
              className={`rounded-lg border border-edge bg-panel p-5 ${i === PIPELINE.length - 1 ? "border-lime-dim md:col-span-2" : ""}`}
            >
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-2xl font-black text-lime">{num}</span>
                <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-paper">
                  {title}
                </h3>
              </div>
              <p className="mt-2 font-sans text-sm leading-relaxed text-fog">{body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* proof */}
      <section id="proof" className="border-y border-edge-soft bg-panel">
        <div className="mx-auto max-w-6xl px-4 py-20 md:px-6">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-fog">
            Not a mockup
          </h2>
          <p className="mt-2 max-w-xl font-mono text-2xl font-bold text-paper">
            A real KeeperHub execution on Base Sepolia, verified against the chain.
          </p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-8 overflow-x-auto rounded-lg border border-lime-dim/50 bg-night p-5 font-mono text-xs leading-loose text-fog"
          >
            <p><span className="text-fog-dim">executionId</span>  g0w11wukbk1v0psyditx4</p>
            <p><span className="text-fog-dim">block</span>        45243955</p>
            <p><span className="text-fog-dim">sponsored</span>    true</p>
            <p><span className="text-fog-dim">verified</span>     <span className="text-lime">true</span></p>
            <p><span className="text-fog-dim">receipt</span>      <span className="text-lime">success</span></p>
            <p className="mt-2">
              <a href={TX_LINK} target="_blank" rel="noopener noreferrer" className="text-lime underline underline-offset-4 hover:text-paper">
                0x1130…278c on BaseScan ↗
              </a>
            </p>
          </motion.div>
          <p className="mt-4 max-w-xl font-sans text-sm text-fog">
            The full flight report — simulate, execute, poll, receipt-verify — ships in the repo.
            Anything unproven renders as unproven. That is the product.
          </p>
        </div>
      </section>

      {/* mcp */}
      <section id="mcp" className="mx-auto max-w-6xl px-4 py-20 md:px-6">
        <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-2">
          <div>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-fog">
              Agents welcome
            </h2>
            <p className="mt-2 font-mono text-2xl font-bold text-paper">
              Your tab, as an MCP server.
            </p>
            <p className="mt-4 font-sans text-sm leading-relaxed text-fog">
              FINALTab exposes its deterministic split engine over the Model Context Protocol.
              Connect it to Claude and ask for a cent-perfect split from a chat window —
              the same engine, the same rules: models propose, the engine decides.
            </p>
          </div>
          <motion.pre
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="overflow-x-auto rounded-lg border border-edge bg-panel p-5 font-mono text-xs leading-relaxed text-fog"
          >
            <code>{`{
  "mcpServers": {
    "finaltab": {
      "url": "https://finaltab.vercel.app/api/mcp"
    }
  }
}

> split £54.00 between vee, hem, ravi
{ "shares": ["18.00", "18.00", "18.00"],
  "sumsToTotal": true }`}</code>
          </motion.pre>
        </div>
      </section>

      {/* cta */}
      <section className="border-t border-edge-soft">
        <div className="mx-auto max-w-6xl px-4 py-24 text-center md:px-6">
          <motion.p
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="font-mono text-[clamp(1.8rem,4.5vw,3.2rem)] font-black leading-tight text-paper"
          >
            A transaction hash proves <span className="text-coral">submission</span>.
            <br />
            Only a receipt proves <span className="text-lime">landing</span>.
          </motion.p>
          <Link
            href="/app"
            className="mt-10 inline-block rounded bg-lime px-8 py-4 font-mono text-base font-bold uppercase tracking-wider text-ink transition hover:bg-lime-dim"
          >
            open the lab →
          </Link>
        </div>
      </section>

      <footer className="border-t border-edge-soft py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 font-mono text-[10px] uppercase tracking-wider text-fog-dim md:px-6">
          <span>FINALTab · KeeperHub “Agents Onchain” hackathon</span>
          <span>
            <a href="https://github.com/vaibhav4046/finaltab" target="_blank" rel="noopener noreferrer" className="hover:text-fog">github</a>
            {" · "}
            <a href={TX_LINK} target="_blank" rel="noopener noreferrer" className="hover:text-fog">verified flight</a>
          </span>
        </div>
      </footer>
    </div>
  );
}

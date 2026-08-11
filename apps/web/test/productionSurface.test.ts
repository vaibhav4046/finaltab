import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));

const EXPECTED_MCP_TOOLS = [
  "split_equal",
  "split_weighted",
  "net_debts",
  "allocate_receipt",
  "prepare_receipt_settlement",
  "simulate_signed_settlement",
  "create_broadcast_approval_challenge",
  "submit_signed_settlement",
  "settlement_status",
] as const;

function productionSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return productionSourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

describe("production surface retirement gate", () => {
  it("keeps user-visible production source free of UTF-8 mojibake", () => {
    const source = [
      ...productionSourceFiles(join(WEB_ROOT, "app")),
      ...productionSourceFiles(join(WEB_ROOT, "components")),
      ...productionSourceFiles(join(WEB_ROOT, "lib")),
    ].map((file) => readFileSync(file, "utf8")).join("\n");

    expect(source).not.toMatch(/[\u00c2\u00c3\u00e2\ufffd]/);
  });

  it("registers exactly the nine external-wallet MCP tools", () => {
    const route = readFileSync(join(WEB_ROOT, "app", "api", "mcp", "route.ts"), "utf8");
    const names = [...route.matchAll(/server\.registerTool\(\s*"([^"]+)"/g)].map((match) => match[1]);

    expect(names).toEqual(EXPECTED_MCP_TOOLS);
    expect(new Set(names).size).toBe(EXPECTED_MCP_TOOLS.length);
  });

  it("keeps fixed signers, local private-key flows, pseudo history, and the retired lab out of routes and UI", () => {
    const files = [
      ...productionSourceFiles(join(WEB_ROOT, "app")),
      ...productionSourceFiles(join(WEB_ROOT, "components")),
      join(WEB_ROOT, "lib", "flow.ts"),
      join(WEB_ROOT, "lib", "server", "mcpSettlement.ts"),
    ];
    const source = files.map((file) => `${file}\n${readFileSync(file, "utf8")}`).join("\n");

    expect(source).not.toMatch(/\b(?:Vee|Hem|Ravi)\b/);
    expect(source).not.toMatch(/makeDemoPeople|demoPrivateKey|resolveDemoKeys/);
    expect(source).not.toMatch(/FINALTAB_(?:ENABLE_DEMO_MONEY_TOOLS|DEMO_APPROVER_ADDRESS|AGENT_KEY_)/);
    expect(source).not.toMatch(/registerTool\(\s*["']demo_/);
    expect(source).not.toMatch(/(?:generatePrivateKey|privateKeyToAccount)\s*\(/);
    expect(source).not.toMatch(/["']\/lab(?:["'/?#]|$)/);
    expect(source).not.toMatch(/(?:recordTab|loadHistory|loadProfile)\s*\(/);
    expect(source).not.toMatch(/receiptId\s*\?\?\s*["']receipt-1["']/);
    expect(source).not.toMatch(/receiptNonce|receipt-\$\{receipt\.receipt\.merchant/);
    expect(source).not.toMatch(/name\.trim\(\)\s*\|\|\s*`Person/);
    expect(source).not.toContain("Demo wallets");
  });

  it("launches bounded review only from a confirmed shared-tab proposal", () => {
    const launcher = readFileSync(join(WEB_ROOT, "components", "AgentReviewLauncher.tsx"), "utf8");
    const room = readFileSync(join(WEB_ROOT, "components", "Lab.tsx"), "utf8");

    expect(room).toContain("<AgentReviewLauncher");
    expect(room).toContain("cloudTabId={cloudTabId}");
    expect(room).toContain("payerParticipantId={payerId}");
    expect(room).toContain("review={review}");
    expect(room).toContain("reviewInputKey={reviewInputKey}");
    expect(room).toContain("reviewedSettlementInputKey({");
    expect(room).toContain("onReviewed={setReview}");
    expect(room.match(/setReview\(invalidateReviewedSettlement\(\)\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(launcher).toMatch(/cloudTabId\s*&&\s*receipt\?\.confirmedAt\s*&&\s*allocation\s*&&\s*payerParticipantId/);
    expect(launcher).toContain("existingProposal: allocation.proposal");
    expect(launcher).toContain("receiptConfirmed: true");
    expect(launcher).toContain('fetch("/api/agents/runs"');
    expect(launcher).toContain("signal: controller.signal");
    expect(launcher).toContain("requestedInputKey !== inputKeyRef.current");
    expect(launcher).toContain("inputKey: requestedInputKey");
    expect(launcher).not.toContain('fetch("/api/vision/allocate"');
    expect(room).toContain('fetch("/api/tabs"');
    expect(room).toContain('JSON.stringify({ title, currency: "USD" })');
    expect(room).toContain("if (!cloudTabId)");
    expect(room).toContain("FINALTab will not open an unsaved settlement room");

    const rail = readFileSync(join(WEB_ROOT, "components", "ExecutionRail.tsx"), "utf8");
    expect(rail).toContain("const reviewReady = reviewedReceiptId(review, reviewInputKey) !== null");
    expect(rail).toContain("freezeReviewedLedger(people, netted, review, currency, reviewInputKey)");
    expect(rail).not.toContain('receiptId ?? "receipt-1"');
  });

  it("keeps the install surface on transparent current-brand assets", () => {
    const manifest = readFileSync(join(WEB_ROOT, "public", "manifest.webmanifest"), "utf8");
    const icon = readFileSync(join(WEB_ROOT, "public", "icon.svg"), "utf8");
    const layout = readFileSync(join(WEB_ROOT, "app", "layout.tsx"), "utf8");
    const appleIcon = readFileSync(join(WEB_ROOT, "public", "apple-touch-icon.png"));
    const icon192 = readFileSync(join(WEB_ROOT, "public", "icon-192.png"));
    const icon512 = readFileSync(join(WEB_ROOT, "public", "icon-512.png"));
    const maskableIcon = readFileSync(join(WEB_ROOT, "public", "icon-maskable.png"));

    expect(manifest).toContain('"src": "/icon.svg"');
    expect(JSON.parse(manifest).icons).toEqual([
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ]);
    expect(icon).not.toMatch(/<rect[^>]+(?:width="512"|width="100%")/i);
    expect(icon).toContain("#c8ff3d");
    expect(icon).toContain("#45afff");
    expect(layout).toContain('{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }');
    expect(layout).toContain('{ url: "/icon-512.png", sizes: "512x512", type: "image/png" }');
    expect(layout).toContain('apple: [{ url: "/apple-touch-icon.png", sizes: "180x180"');
    for (const [png, size] of [[appleIcon, 180], [icon192, 192], [icon512, 512], [maskableIcon, 512]] as const) {
      expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
      expect(png.readUInt8(25)).toBe(6);
    }
  });

  it("separates deployment provenance from the one-atomic-unit settlement proof", () => {
    const landing = readFileSync(join(WEB_ROOT, "components", "Landing.tsx"), "utf8");

    expect(landing).toContain("V2 contract deployment");
    expect(landing).toContain("One-atomic-unit USDC settlement");
    expect(landing).toContain("3hmlqi36zweiwg6fc5o2u");
    expect(landing).toContain("0x7a6fb760f691954a41c71d5d508629c58aa09207bba0de4eaf164f097c59a789");
    expect(landing).toContain("Deployment provenance is not presented as settlement proof.");
  });

  it("keeps responsive controls, motion preferences, landmarks, and Privy loading explicit", () => {
    const receipt = readFileSync(join(WEB_ROOT, "components", "ReceiptPanel.tsx"), "utf8");
    const split = readFileSync(join(WEB_ROOT, "components", "SplitPanel.tsx"), "utf8");
    const rail = readFileSync(join(WEB_ROOT, "components", "ExecutionRail.tsx"), "utf8");
    const room = readFileSync(join(WEB_ROOT, "components", "Lab.tsx"), "utf8");
    const globals = readFileSync(join(WEB_ROOT, "app", "globals.css"), "utf8");
    const notes = readFileSync(join(WEB_ROOT, "components", "ui.tsx"), "utf8");
    const joinPanel = readFileSync(join(WEB_ROOT, "components", "JoinInvitePanel.tsx"), "utf8");
    const privyShell = readFileSync(join(WEB_ROOT, "components", "PrivySessionPanel.tsx"), "utf8");
    const authPages = [
      join(WEB_ROOT, "app", "auth", "page.tsx"),
      join(WEB_ROOT, "app", "auth", "sign-in", "page.tsx"),
      join(WEB_ROOT, "app", "auth", "create-account", "page.tsx"),
      join(WEB_ROOT, "app", "auth", "complete", "page.tsx"),
      join(WEB_ROOT, "app", "auth", "complete", "loading.tsx"),
      join(WEB_ROOT, "app", "auth", "complete", "error.tsx"),
    ].map((file) => readFileSync(file, "utf8")).join("\n");

    expect(receipt).toContain("motion, useReducedMotion");
    expect(receipt).toContain("event.clipboardData.files");
    expect(receipt).toContain("Take photo, drop, browse, or paste");
    expect(receipt).toContain("grid gap-2 sm:grid-cols-[1fr_1.3fr_auto]");
    expect(split).toContain("motion, useReducedMotion");
    expect(split).toContain("min-h-11 rounded-md border px-3");
    expect(rail).toContain("motion, useReducedMotion");
    expect(room).toContain("settlement-room-shell");
    expect(globals).toMatch(/\.app-shell \.settlement-room-shell\s*\{[^}]*max-width:\s*128rem/s);
    expect(notes).toContain('role="alert"');
    expect(notes).toContain('role="status" aria-live="polite"');
    expect(joinPanel).toContain('<main className="app-shell');
    expect(authPages).not.toContain("<main");
    expect(privyShell).toContain('import("./PrivySessionPanelRuntime")');
    expect(privyShell).not.toContain("@privy-io/react-auth");
    expect(privyShell).toContain("if (!bridge.providerConfigured) return null");
    expect(privyShell).not.toContain("Privy setup required");
  });

  it("keeps single-use invite secrets out of auth and callback URLs", () => {
    const joinSource = readFileSync(join(WEB_ROOT, "components", "JoinInvitePanel.tsx"), "utf8");

    expect(joinSource).toContain('fetch("/api/invites/handoff"');
    expect(joinSource).toContain("body: JSON.stringify({ token: fragmentToken })");
    expect(joinSource).toContain('fetch("/api/invites/join"');
    expect(joinSource).toContain('href="/auth?next=%2Fjoin"');
    expect(joinSource).not.toMatch(/\/join\?token=|searchParams\.get\(["']token["']\)/);
    expect(joinSource).not.toContain("sessionStorage");
  });
});

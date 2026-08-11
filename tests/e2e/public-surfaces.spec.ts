import { expect, test } from "@playwright/test";

test("landing page presents the product, proof, and MCP entry points", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveTitle("FINALTab — receipt to verified testnet settlement");
  await expect(page.getByText(/receipt.*consent.*KeeperHub.*exact proof/i)).toBeVisible();
  await expect(page.getByText("KeeperHub V2 live", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /MCP developer guide/i })).toBeVisible();
  await expect(page.getByText(/\b(?:Vee|Hem|Ravi|Mara|Noah|Priya)\b|demo_/i)).toHaveCount(0);
  await expect(page.locator("[data-finaltab-mark]")).toHaveCount(0);
});

test("landing disables ambient motion when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const motion = await page.evaluate(() => ({
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    tickerAnimation: getComputedStyle(document.querySelector(".evidence-marquee-track")!).animationName,
    scanDisplay: getComputedStyle(document.querySelector(".scan-window")!, "::after").display,
  }));

  expect(motion).toEqual({
    scrollBehavior: "auto",
    tickerAnimation: "none",
    scanDisplay: "none",
  });
});

test("nonce CSP hydrates the interactive landing at mobile, desktop, and 4K widths", async ({ browser }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
    { width: 3840, height: 2160 },
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const response = await page.goto("/", { waitUntil: "networkidle" });
    expect(response?.headers()["content-security-policy"]).toContain("'strict-dynamic'");
    await expect(page.locator("h1")).toHaveCSS("opacity", "1");

    const proofStage = page.getByRole("button", { name: /Match exact proof/i });
    await proofStage.click();
    await expect(proofStage).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Fail closed on any mismatch", { exact: true })).toBeVisible();

    const browserState = await page.evaluate(() => ({
      allScriptsHaveNonce: [...document.scripts].every((script) => Boolean(script.nonce)),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(browserState).toEqual({ allScriptsHaveNonce: true, overflow: 0 });
    expect(pageErrors).toEqual([]);
    expect(consoleErrors.filter((message) => /content security policy|refused to execute|hydration|uncaught/i.test(message))).toEqual([]);
    await context.close();
  }
});

test("favicon and manifest use the transparent FT vector", async ({ request }) => {
  const iconResponse = await request.get("/icon.svg");
  expect(iconResponse.ok()).toBeTruthy();
  const icon = await iconResponse.text();
  expect(icon).toContain("viewBox=\"0 0 512 512\"");
  expect(icon).not.toMatch(/<rect\b/i);
  expect(icon).not.toMatch(/<svg[^>]+(?:fill|style)=/i);

  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.icons).toEqual([
    { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ]);

  for (const path of ["/icon-192.png", "/icon-512.png", "/icon-maskable.png"]) {
    const response = await request.get(path);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("image/png");
  }
});

test("developer page publishes only the authenticated MCP v2 production surface", async ({ page }) => {
  await page.goto("/developers");

  await expect(
    page.getByText("https://finaltab.vercel.app/api/mcp", { exact: true }),
  ).toBeVisible();

  const productionManifest = page.getByTestId("mcp-production-tools");
  for (const tool of [
    "split_equal",
    "split_weighted",
    "net_debts",
    "allocate_receipt",
    "prepare_receipt_settlement",
    "simulate_signed_settlement",
    "create_broadcast_approval_challenge",
    "submit_signed_settlement",
    "settlement_status",
  ]) {
    await expect(productionManifest.getByText(tool, { exact: true })).toBeVisible();
  }

  await expect(page.getByText(/demo_(?:get_balances|prepare_settlement|settle_tab)|\b(?:Vee|Hem|Ravi)\b/i)).toHaveCount(0);

  await expect(page.getByText(/confirm: true.*not accepted/i)).toBeVisible();
  await expect(page.getByTestId("codex-mcp-config")).toContainText("bearer_token_env_var");
  await expect(page.getByTestId("codex-mcp-config")).toContainText("approval_mode = \"prompt\"");
  await expect(page.getByTestId("claude-mcp-config")).toContainText("Authorization:${FINALTAB_AUTH_HEADER}");
  await expect(page.getByTestId("mcp-curl-example")).toContainText("Authorization: Bearer ${FINALTAB_MCP_TOKEN}");
});

test("protected workspace pages never fall back to a demo identity", async ({ page }) => {
  for (const path of ["/app/proof", "/app/tab"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/auth\?error=(?:cloud-not-configured|session-required)&next=/);
    await expect(page.getByRole("heading", { name: "One real account. Supabase-secured." })).toBeVisible();
    await expect(page.getByText(/local profile|choose.*sigil/i)).toHaveCount(0);
  }
});

test("retired synthetic reliability route is not a product surface", async ({ request }) => {
  const response = await request.get("/lab");
  expect(response.status()).toBe(404);
});

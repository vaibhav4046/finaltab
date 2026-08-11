import { expect, test } from "@playwright/test";

test("landing page presents the product, proof, and MCP entry points", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveTitle(/FINALTab/i);
  await expect(page.getByText(/Receipt.*consent.*landed proof/)).toBeVisible();
  await expect(page.getByText("Real KeeperHub V2 deployment", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /MCP developer guide/i })).toBeVisible();
});

test("developer page publishes the authenticated MCP v2 production and demo boundaries", async ({ page }) => {
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

  const demoManifest = page.getByTestId("mcp-demo-tools");
  for (const tool of ["demo_get_balances", "demo_prepare_settlement", "demo_settle_tab"]) {
    await expect(demoManifest.getByText(tool, { exact: true })).toBeVisible();
  }

  await expect(page.getByText(/confirm: true.*not accepted/i)).toBeVisible();
  await expect(page.getByTestId("codex-mcp-config")).toContainText("bearer_token_env_var");
  await expect(page.getByTestId("codex-mcp-config")).toContainText("approval_mode = \"prompt\"");
  await expect(page.getByTestId("claude-mcp-config")).toContainText("Authorization:${FINALTAB_AUTH_HEADER}");
  await expect(page.getByTestId("mcp-curl-example")).toContainText("Authorization: Bearer ${FINALTAB_MCP_TOKEN}");
});

test("reference proof requires a live execution lookup", async ({ page }) => {
  await page.goto("/app/proof");

  await expect(page.getByRole("heading", { name: "Open a settlement capsule" })).toBeVisible();
  const executionInput = page.getByRole("textbox", { name: "KeeperHub execution ID" });
  const settlementInput = page.getByRole("textbox", { name: "Frozen settlement ID" });
  const ledgerInput = page.getByRole("textbox", { name: "Frozen ledger hash" });
  await expect(executionInput).toBeVisible();
  await expect(settlementInput).toBeVisible();
  await expect(ledgerInput).toBeVisible();
  await expect(page.getByText(/both indexed V2 plan identifiers must match/i)).toBeVisible();

  const executionId = "xasakw5nfxkh2s0fh4stn";
  const settlementId = `0x${"00".repeat(32)}`;
  const ledgerHash = `0x${"11".repeat(32)}`;
  await executionInput.fill(executionId);
  await settlementInput.fill(settlementId);
  await ledgerInput.fill(ledgerHash);
  await page.getByRole("button", { name: "Verify now" }).click();

  await expect(page.getByRole("heading", { name: "Check the execution or try again" })).toBeVisible();
  await expect(page.getByText(/No success is implied/i)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "KeeperHub execution ID" })).toHaveValue(executionId);
  await expect(page.getByRole("textbox", { name: "Frozen settlement ID" })).toHaveValue(settlementId);
  await expect(page.getByRole("textbox", { name: "Frozen ledger hash" })).toHaveValue(ledgerHash);
});

test("settlement workspace starts at an explicit receipt-consent boundary", async ({ page }) => {
  await page.goto("/app/tab");

  await expect(page.getByText(/Base Sepolia.*USDC.*KeeperHub execution/)).toBeVisible();
  const upload = page.getByRole("button", { name: /Take photo, drop, or browse/i });
  await expect(upload).toBeDisabled();
  await page.getByRole("checkbox", { name: /I consent to this image/i }).check();
  await expect(upload).toBeEnabled();
});

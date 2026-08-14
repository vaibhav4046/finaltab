import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// Operator probe for the real production browser voice lifecycle (issue #3,
// criteria 1, 2, 3 and 5). It is skipped by default and can only run when an
// operator supplies a storage state carrying a real Supabase user session:
// `apps/web/lib/server/voiceQuota.ts` rejects every principal whose source is
// not `session` or `bearer-jwt`, so no machine token can mint an AssemblyAI
// credential and no unauthenticated run can reach this surface.
//
//   E2E_VOICE_STORAGE_STATE=./voice-session.json \
//   E2E_BASE_URL=https://finaltab.vercel.app \
//   pnpm exec playwright test tests/e2e/voice-lifecycle.spec.ts --project=chromium
//
// The microphone is a Chromium fake device fed by retained, locally generated
// speech, so a run costs exactly one AssemblyAI streaming session and never
// touches participant funds or a paid readback.
const storageState = process.env.E2E_VOICE_STORAGE_STATE;
const fixtureWav = resolve(
  process.env.E2E_VOICE_FIXTURE_WAV
    ?? "video/finaltab-winner/assets/audio/voice-v3/source-local/scene-01-kokoro.wav",
);

const SESSION_BLOCKER =
  "Set E2E_VOICE_STORAGE_STATE to a Playwright storage state holding a real Supabase user session. "
  + "Voice token minting requires principal.source === 'session' | 'bearer-jwt' with a UUID subject, "
  + "so this lifecycle cannot be exercised without one.";

const FIXTURE_BLOCKER =
  `Fake-microphone fixture not found at ${fixtureWav}. `
  + "Set E2E_VOICE_FIXTURE_WAV to a 16-bit PCM mono WAV Chromium can replay.";

// Permanent-credential shapes. The assertions below prove absence; no captured
// value is ever printed.
const ELEVENLABS_KEY = /\bsk_[a-f0-9]{40,}/;
const ASSEMBLYAI_KEY = /\b[a-f0-9]{32}\b/;

// `launchOptions` forces a new worker, so Playwright requires it at file scope
// rather than inside the describe block.
test.use({
  storageState,
  permissions: ["microphone"],
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${fixtureWav}`,
    ],
  },
});

test.describe("production voice lifecycle", () => {
  test.skip(!storageState, SESSION_BLOCKER);
  test.skip(Boolean(storageState) && !existsSync(fixtureWav), FIXTURE_BLOCKER);

  async function openSettlementRoom(page: import("@playwright/test").Page) {
    await page.goto("/app/tab");
    await expect(page).not.toHaveURL(/\/auth\?/);
    const nameField = page.getByLabel("Tab name");
    if (await nameField.isVisible()) {
      await nameField.fill(`Voice lifecycle probe · ${new Date().toISOString()}`);
      await page.getByRole("button", { name: "Create and open" }).click();
    }
    await expect(page.getByText("SETTLEMENT ROOM", { exact: true })).toBeVisible();
    return page.locator("section[aria-label='Voice allocation receipt']");
  }

  test("minting a capture credential returns a short-lived token and durable quota headers", async ({ page }) => {
    const voice = await openSettlementRoom(page);

    const minted = page.waitForResponse(
      (response) => response.url().includes("/api/voice/token") && response.request().method() === "POST",
    );
    await voice.getByRole("button", { name: "Start listening" }).click();
    const response = await minted;

    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers["x-voice-budget-durable"]).toBe("true");
    expect(headers["x-voice-budget-unit"]).toBe("seconds");
    expect(Number(headers["x-voice-budget-user-day-remaining"])).toBeGreaterThanOrEqual(0);
    expect(Number(headers["x-voice-budget-user-month-remaining"])).toBeGreaterThanOrEqual(0);
    expect(headers["cache-control"]).toContain("no-store");

    const session = await response.json() as { token: string; expiresInSeconds: number; websocketUrl: string };
    const serialized = JSON.stringify(session);
    // The permanent provider keys must never appear in a browser-visible payload,
    // and the temporary token must not be pre-baked into the socket URL.
    expect(serialized).not.toMatch(ELEVENLABS_KEY);
    expect(serialized.replace(session.token, "")).not.toMatch(ASSEMBLYAI_KEY);
    expect(session.expiresInSeconds).toBeLessThanOrEqual(600);
    expect(session.websocketUrl).toContain("wss://streaming.eu.assemblyai.com/v3/ws");
    expect(session.websocketUrl).not.toContain(session.token);
    expect(session.websocketUrl).not.toContain("token=");

    await voice.getByRole("button", { name: "Stop" }).click();
    await expect(voice.getByRole("button", { name: /Start listening|Opening…/ })).toBeEnabled({ timeout: 20_000 });
  });

  test("a live transcript reaches the engine only through Use transcript", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const voice = await openSettlementRoom(page);
    await voice.getByRole("button", { name: "Start listening" }).click();
    await expect(voice.getByText("Listening", { exact: true })).toBeVisible({ timeout: 20_000 });

    // The prompt only renders while the transcript is empty, so its disappearance
    // is the provider's first real word arriving in the browser.
    await expect(
      voice.getByText("Say who had what and how shared items, tax, service, or tip should be divided."),
    ).toHaveCount(0, { timeout: 45_000 });

    await voice.getByRole("button", { name: "Stop" }).click();
    const useTranscript = voice.getByRole("button", { name: "Use transcript" });
    await expect(useTranscript).toBeEnabled({ timeout: 20_000 });

    const instruction = page.getByPlaceholder(/Describe which participants shared each item/);
    await expect(instruction).toHaveValue("");

    await useTranscript.click();
    // "Transcript used" renders only when the textarea holds exactly the final
    // transcript, so it proves the transfer without a brittle text selector.
    await expect(voice.getByRole("button", { name: "Transcript used" })).toBeVisible();
    expect((await instruction.inputValue()).trim().length).toBeGreaterThan(0);

    // A transcript is an instruction draft, nothing more: allocation stays gated
    // on a confirmed receipt, two participants and a payer.
    await expect(page.getByRole("button", { name: /^(?:Allocate|Re-allocate)$/ })).toBeDisabled();
    await expect(page.getByText("upload a receipt first")).toBeVisible();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors.filter((message) => /content security policy|refused to|uncaught/i.test(message))).toEqual([]);
  });

  test("stopping during connect leaves the control usable instead of stuck", async ({ page }) => {
    const voice = await openSettlementRoom(page);

    await voice.getByRole("button", { name: "Start listening" }).click();
    await voice.getByRole("button", { name: "Stop" }).click();

    // Either terminal state is acceptable; a permanently busy control is not.
    await expect(voice.getByText(/^(?:Ready|Needs attention)$/)).toBeVisible({ timeout: 20_000 });
    await expect(voice.getByRole("button", { name: "Start listening" })).toBeEnabled();
    await expect(voice.getByRole("button", { name: "Stop" })).toHaveCount(0);
  });
});

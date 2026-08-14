import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Automated accessibility coverage for the routes a judge reaches without a
 * session. This supplements the manual keyboard/contrast/reduced-motion checks
 * recorded in the release notes; axe catches regressions in the machine-checkable
 * subset, it does not certify the page.
 */
const PUBLIC_ROUTES = ["/", "/auth", "/developers", "/open-source"] as const;

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

for (const route of PUBLIC_ROUTES) {
  test(`no WCAG A/AA violations on ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: "networkidle" });

    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

    expect(
      violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => node.target.join(" ")),
      })),
    ).toEqual([]);
  });
}

test("interactive landing controls stay reachable and visible under keyboard focus", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  const proofStage = page.getByRole("button", { name: /Match exact proof/i });
  await proofStage.focus();
  await expect(proofStage).toBeFocused();

  // A focus ring that renders as `outline: none` with no replacement is the
  // failure this guards: keyboard users lose their position on the page.
  const focusRing = await proofStage.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
    };
  });
  const hasVisibleFocusIndicator =
    (focusRing.outlineStyle !== "none" && focusRing.outlineWidth !== "0px") ||
    (focusRing.boxShadow !== "none" && focusRing.boxShadow !== "");
  expect(hasVisibleFocusIndicator, JSON.stringify(focusRing)).toBe(true);

  await page.keyboard.press("Enter");
  await expect(proofStage).toHaveAttribute("aria-pressed", "true");
});

test("primary touch targets meet the 24px minimum on mobile", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto("/", { waitUntil: "networkidle" });

  const undersized = await page.evaluate(() => {
    const targets = [...document.querySelectorAll<HTMLElement>("a[href], button")];
    return targets
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        // Hidden or collapsed elements are not pointer targets.
        if (rect.width === 0 || rect.height === 0) return false;
        return rect.width < 24 || rect.height < 24;
      })
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        text: (element.textContent ?? "").trim().slice(0, 40),
        width: Math.round(element.getBoundingClientRect().width),
        height: Math.round(element.getBoundingClientRect().height),
      }));
  });

  expect(undersized).toEqual([]);
  await context.close();
});

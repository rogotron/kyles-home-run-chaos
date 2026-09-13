import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { TargetId } from "../../src/types";
const state = (page: Page) =>
  page.evaluate(() => window.__HOME_RUN_CHAOS__.getState());
async function finishRound(page: Page) {
  await page.evaluate(() => {
    const game = window.__HOME_RUN_CHAOS__;
    for (let i = 0; i < 11 && game.getState().pitchNumber < 10; i++)
      game.triggerContact("Miss");
  });
  await expect
    .poll(async () => (await state(page)).phase, { timeout: 8000 })
    .not.toBe("playing");
}
test("reset clears the current game while retaining saved records", async ({
  page,
}) => {
  await page.evaluate(() =>
    window.__HOME_RUN_CHAOS__.triggerContact("Perfect"),
  );
  await expect
    .poll(async () => (await state(page)).score, { timeout: 12000 })
    .toBeGreaterThan(0);
  await finishRound(page);
  const record = (await state(page)).records.highScore;
  await page.evaluate(() => window.__HOME_RUN_CHAOS__.reset());
  expect((await state(page)).score).toBe(0);
  expect((await state(page)).phase).toBe("menu");
  expect((await state(page)).records.highScore).toBe(record);
});
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.__HOME_RUN_CHAOS__));
});
test("starts solo with Space and makes real keyboard contact on an automatic pitch", async ({
  page,
}) => {
  await expect(page.getByText("SWING BIG.")).toBeVisible();
  await page.keyboard.press("Space");
  await expect.poll(async () => (await state(page)).phase).toBe("playing");
  await page.waitForFunction(() => {
    const s = window.__HOME_RUN_CHAOS__.getState();
    return (
      s.pitchState === "pitching" &&
      s.pitchProgress > 0.94 &&
      s.pitchProgress < 1.1
    );
  });
  await page.keyboard.press("Space");
  await expect.poll(async () => (await state(page)).pitchState).toBe("flight");
  expect(["Good", "Perfect"]).toContain((await state(page)).swingResult);
  await expect
    .poll(async () => (await state(page)).score, { timeout: 12000 })
    .toBeGreaterThan(0);
  expect((await state(page)).homeRunCount).toBeGreaterThan(0);
});
test("click swings, arrow keys aim, and an untouched pitch is a miss", async ({
  page,
}) => {
  await page.getByRole("button", { name: "LET’S MAKE CHAOS" }).click();
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(180);
  await page.keyboard.up("ArrowLeft");
  expect((await state(page)).aim).toBeGreaterThan(0.08);
  await expect
    .poll(async () => (await state(page)).swingResult, { timeout: 8000 })
    .toBe("Miss");
  expect((await state(page)).score).toBe(0);
  await page.evaluate(() => window.__HOME_RUN_CHAOS__.predictablePitch());
  await page.waitForFunction(
    () => window.__HOME_RUN_CHAOS__.getState().pitchProgress > 0.96,
  );
  await page.mouse.click(720, 430);
  await expect.poll(async () => (await state(page)).pitchState).toBe("flight");
});
test("perfect home run updates points, streak, multiplier and local high score", async ({
  page,
}) => {
  await page.evaluate(() =>
    window.__HOME_RUN_CHAOS__.triggerContact("Perfect"),
  );
  await expect
    .poll(async () => (await state(page)).homeRunCount, { timeout: 12000 })
    .toBe(1);
  const first = (await state(page)).score;
  expect(first).toBeGreaterThan(2000);
  await page.evaluate(() =>
    window.__HOME_RUN_CHAOS__.triggerContact("Perfect"),
  );
  await expect
    .poll(async () => (await state(page)).homeRunCount, { timeout: 12000 })
    .toBe(2);
  expect((await state(page)).multiplier).toBe(1.5);
  await finishRound(page);
  await expect(page.locator("#end-screen")).toBeVisible();
  const score = (await state(page)).score;
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__HOME_RUN_CHAOS__));
  expect((await state(page)).records.highScore).toBe(score);
});
test("pitches 9 and 10 are golden and double the score", async ({ page }) => {
  await page.keyboard.press("Space");
  await page.evaluate(() => {
    for (let i = 0; i < 8; i++)
      window.__HOME_RUN_CHAOS__.triggerContact("Miss");
  });
  expect((await state(page)).golden).toBe(false);
  await page.evaluate(() =>
    window.__HOME_RUN_CHAOS__.triggerContact("Perfect"),
  );
  expect((await state(page)).pitchNumber).toBe(9);
  expect((await state(page)).golden).toBe(true);
  await expect(page.locator("#pitch-count")).toHaveText("Pitch 9 of 10");
  await expect(page.locator("#multiplier")).toHaveText("2×");
  await expect
    .poll(async () => (await state(page)).score, { timeout: 12000 })
    .toBeGreaterThan(4000);
  expect((await state(page)).hits.at(-1)?.calculation).toContain("× 2 golden");
});
for (const target of [
  "goal",
  "dinosaur",
  "ufo",
  "icecream",
  "toilet",
] as TargetId[]) {
  test(`Rapier collision registers the ${target} target`, async ({ page }) => {
    await page.evaluate(
      (id) => window.__HOME_RUN_CHAOS__.launchAtTarget(id),
      target,
    );
    await expect
      .poll(async () => (await state(page)).lastTargetHit, { timeout: 12000 })
      .toBe(target);
    await expect
      .poll(async () => (await state(page)).score, { timeout: 5000 })
      .toBeGreaterThan(target === "goal" ? 6000 : 2000);
    if (target === "goal")
      expect((await state(page)).hits.at(-1)?.calculation).toContain(
        "× 3 goal",
      );
  });
}
test("Kyle vs Dad handoff, winner, and rematch", async ({ page }) => {
  await page.locator("#versus-mode").click();
  await page.locator("#play").click();
  expect((await state(page)).mode).toBe("versus");
  await finishRound(page);
  await expect(page.getByText("YOU’RE UP, DAD.")).toBeVisible();
  await page.locator("#next").click();
  expect((await state(page)).currentPlayer).toBe("Dad");
  await page.evaluate(() => window.__HOME_RUN_CHAOS__.triggerContact("Good"));
  await expect
    .poll(async () => (await state(page)).score, { timeout: 12000 })
    .toBeGreaterThan(0);
  await finishRound(page);
  await expect(page.getByText("DAD WINS!")).toBeVisible();
  await page.locator("#next").click();
  expect((await state(page)).currentPlayer).toBe("Kyle");
  expect((await state(page)).score).toBe(0);
});
test("P and Escape pause, R restarts the current round", async ({ page }) => {
  await page.keyboard.press("Space");
  await page.keyboard.press("p");
  expect((await state(page)).paused).toBe(true);
  const before = (await state(page)).timeRemaining;
  await page.waitForTimeout(300);
  expect((await state(page)).timeRemaining).toBe(before);
  await page.keyboard.press("Escape");
  expect((await state(page)).paused).toBe(false);
  await page.evaluate(() => window.__HOME_RUN_CHAOS__.advanceTime(12));
  await page.keyboard.press("r");
  expect((await state(page)).timeRemaining).toBeGreaterThan(59);
  expect((await state(page)).pitchNumber).toBe(0);
  expect((await state(page)).score).toBe(0);
});
test("browser console is clear and stadium renders on desktop and touch", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__HOME_RUN_CHAOS__));
  await page.screenshot({ path: "test-results/stadium-desktop.png" });
  expect(errors).toEqual([]);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const phone = await context.newPage();
  await phone.goto("/");
  await phone.waitForFunction(() => Boolean(window.__HOME_RUN_CHAOS__));
  await phone.locator("#play").tap();
  await expect(phone.locator("#touch-swing")).toBeVisible();
  await phone.screenshot({ path: "test-results/stadium-touch.png" });
  await phone.evaluate(() => window.__HOME_RUN_CHAOS__.predictablePitch());
  await phone.waitForFunction(
    () => window.__HOME_RUN_CHAOS__.getState().pitchProgress > 0.94,
  );
  await phone.locator("#touch-swing").tap();
  await expect.poll(async () => (await state(phone)).pitchState).toBe("flight");
  await context.close();
});

test("exactly ten untouched pitches finish a round and Play Again resets it", async ({
  page,
}) => {
  test.setTimeout(65000);
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () => window.__HOME_RUN_CHAOS__.getState().phase === "results",
    undefined,
    { timeout: 60000 },
  );
  const result = await state(page);
  expect(result.pitchNumber).toBe(10);
  expect(result.hits.map((h) => h.pitch)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  ]);
  expect(result.hits.every((h) => h.quality === "Miss")).toBe(true);
  await page.waitForTimeout(400);
  expect((await state(page)).pitchNumber).toBe(10);
  await page.getByRole("button", { name: "PLAY AGAIN" }).click();
  expect((await state(page)).score).toBe(0);
  expect((await state(page)).pitchNumber).toBe(0);
});
test("tenth-pitch flight finishes scoring before results, regardless of elapsed time", async ({
  page,
}) => {
  await page.keyboard.press("Space");
  await page.evaluate(() => {
    const game = window.__HOME_RUN_CHAOS__;
    game.advanceTime(300);
    for (let i = 0; i < 9; i++) game.triggerContact("Miss");
    game.triggerContact("Perfect");
  });
  expect((await state(page)).pitchNumber).toBe(10);
  expect((await state(page)).pitchState).toBe("flight");
  expect((await state(page)).phase).toBe("playing");
  await page.keyboard.press("p");
  await page.waitForTimeout(200);
  expect((await state(page)).phase).toBe("playing");
  await page.keyboard.press("p");
  await expect
    .poll(async () => (await state(page)).phase, { timeout: 12000 })
    .toBe("results");
  const result = await state(page);
  expect(result.hits).toHaveLength(10);
  expect(result.score).toBeGreaterThan(4000);
  await page.locator("#round-details summary").click();
  await expect(page.locator("#hit-history li")).toHaveCount(10);
});
test("camera enlarges all four batting subjects and the HUD has only five stats", async ({
  page,
}) => {
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () => window.__HOME_RUN_CHAOS__.getState().cameraZoom > 1.395,
  );
  const framing = await page.evaluate(() =>
    window.__HOME_RUN_CHAOS__.getFraming(),
  );
  for (const item of Object.values(framing)) {
    expect(item.ratio).toBeGreaterThan(1.3);
    expect(item.ratio).toBeLessThan(1.5);
  }
  await expect(page.locator("#hud .hud-stat")).toHaveCount(5);
  await expect(page.locator("#hud")).not.toContainText(
    /SECONDS|STREAK|LONGEST/,
  );
  await expect(page.locator("#targets")).toBeHidden();
  await expect(page.locator(".bottom-bar")).toBeHidden();
  await expect(page.locator("#hit-result,#flight,#pitch-hint")).toHaveCount(0);
  await page.waitForFunction(() => {
    const s = window.__HOME_RUN_CHAOS__.getState();
    return (
      s.pitchState === "pitching" &&
      s.pitchProgress > 0.4 &&
      s.pitchProgress < 0.8 &&
      s.trailCount > 0
    );
  });
  await page.keyboard.press("p");
  await page.screenshot({ path: "test-results/closer-camera.png" });
});

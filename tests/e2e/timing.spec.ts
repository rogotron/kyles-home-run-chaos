import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.__HOME_RUN_CHAOS__));
  await page.clock.pauseAt(new Date(Date.now() + 1000));
});

test("immediate contact and the first rendered frame align bat and ball", async ({
  page,
}) => {
  for (const [ms, quality] of [
    [-400, "Good"],
    [-200, "Perfect"],
    [0, "Perfect"],
    [200, "Perfect"],
    [400, "Good"],
  ] as const) {
    const immediate = await page.evaluate((error) => {
      window.__HOME_RUN_CHAOS__.testSwing(error);
      return window.__HOME_RUN_CHAOS__.getState();
    }, ms);
    expect(immediate.pitchState).toBe("flight");
    expect(immediate.swingResult).toBe(quality);
    expect(immediate.timingErrorMs).toBeCloseTo(ms);
    expect(immediate.idealContactTime).toBeCloseTo(1.45);
    for (const [i, axis] of (["x", "y", "z"] as const).entries()) {
      expect(immediate.barrelPosition[i]).toBeCloseTo(
        immediate.ballPosition[axis],
        5,
      );
      expect(immediate.contactPoint[axis]).toBeCloseTo(
        immediate.ballPosition[axis],
        5,
      );
    }
    await page.clock.runFor(16);
    const frame = await page.evaluate(() =>
      window.__HOME_RUN_CHAOS__.getState(),
    );
    for (const [i, axis] of (["x", "y", "z"] as const).entries()) {
      expect(frame.barrelPosition[i]).toBeCloseTo(frame.ballPosition[axis], 5);
    }
    await page.screenshot({ path: `test-results/timing-contact-${ms}.png` });
    if (ms === 0) {
      expect(frame.ballPosition.z).toBeCloseTo(1.4);
      await page.screenshot({
        path: "test-results/timing-perfect-contact.png",
      });
    }
    await expect(page.locator("#timing-debug")).toContainText(
      `${ms > 0 ? "+" : ""}${ms} ms`,
    );
  }
});

test("timing sign, weaker spray, misses, and the debug toggle", async ({
  page,
}) => {
  const swings = await page.evaluate(() => {
    const game = window.__HOME_RUN_CHAOS__;
    return [-500, 0, 500, -800, 800].map((ms) => {
      game.testSwing(ms);
      return game.getState();
    });
  });
  expect(swings.map((s) => s.swingResult)).toEqual([
    "Early",
    "Perfect",
    "Late",
    "Too early",
    "Miss",
  ]);
  expect(swings[0].ballVelocity.x).toBeGreaterThan(0);
  expect(swings[2].ballVelocity.x).toBeLessThan(0);
  const speed = (s: (typeof swings)[number]) =>
    Math.hypot(...Object.values(s.ballVelocity));
  expect(speed(swings[1])).toBeGreaterThan(speed(swings[0]));
  expect(speed(swings[1])).toBeGreaterThan(speed(swings[2]));
  await expect(page.locator("#timing-debug")).toContainText("+800 ms");
  await page.evaluate(() => window.__HOME_RUN_CHAOS__.setTimingDebug(false));
  await expect(page.locator("#timing-debug")).toBeHidden();
  await page.evaluate(() => window.__HOME_RUN_CHAOS__.setTimingDebug(true));
  await expect(page.locator("#timing-debug")).toBeVisible();
  await page.goto("/?timingDebug=0");
  await page.waitForFunction(() => Boolean(window.__HOME_RUN_CHAOS__));
  await expect(page.locator("#timing-debug")).toBeHidden();
});

test("actual keydown includes the time since the last frame and ignores repeated swings", async ({
  page,
}) => {
  await page.evaluate(() => window.__HOME_RUN_CHAOS__.predictablePitch());
  await page.clock.runFor(1450);
  await page.keyboard.down("Space");
  const hit = await page.evaluate(() => window.__HOME_RUN_CHAOS__.getState());
  expect(hit.pitchState).toBe("flight");
  expect(hit.swingResult).toBe("Perfect");
  expect(hit.timingErrorMs).toBeCloseTo(0, 3);
  await page.keyboard.up("Space");
  await page.keyboard.press("Space");
  const again = await page.evaluate(() => window.__HOME_RUN_CHAOS__.getState());
  expect(again.timingErrorMs).toBe(hit.timingErrorMs);
  expect(again.ballPosition).toEqual(hit.ballPosition);
});

test("the live pitch stays hittable well beyond the former late cutoff", async ({
  page,
}) => {
  await page.evaluate(() => window.__HOME_RUN_CHAOS__.predictablePitch());
  await page.clock.runFor(2000); // 1.45 s ideal + 550 ms late
  const before = await page.evaluate(() =>
    window.__HOME_RUN_CHAOS__.getState(),
  );
  expect(before.pitchState).toBe("pitching");
  await page.keyboard.press("Space");
  const hit = await page.evaluate(() => window.__HOME_RUN_CHAOS__.getState());
  expect(hit.pitchState).toBe("flight");
  expect(hit.swingResult).toBe("Late");
  expect(hit.timingErrorMs).toBeCloseTo(550, 3);
  await page.evaluate(() => window.__HOME_RUN_CHAOS__.predictablePitch());
  await page.clock.runFor(2100); // Clearly outside the 600 ms late allowance
  const missed = await page.evaluate(() =>
    window.__HOME_RUN_CHAOS__.getState(),
  );
  expect(missed.pitchState).toBe("result");
  expect(missed.swingResult).toBe("Miss");
});

import { expect, test } from "@playwright/test";
import { TARGETS, type TargetId } from "../../src/types";
import { scoreHit } from "../../src/scoring";
const ids: TargetId[] = [
  "scoreboard",
  "lights",
  "toilet",
  "baseball",
  "mascot",
  "hotdog",
];
test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await page.waitForFunction(() => !!window.__HOME_RUN_CHAOS__);
  await page.clock.pauseAt(new Date(Date.now() + 1000));
});
for (const id of ids) {
  test(`${id} completes its reaction, awards one bonus, and resets correctly`, async ({
    page,
  }) => {
    await page.evaluate(
      (id) => window.__HOME_RUN_CHAOS__.launchAtTarget(id),
      id,
    );
    await page.clock.runFor(2300);
    const active = await page.evaluate(() =>
      window.__HOME_RUN_CHAOS__.getState(),
    );
    expect(active.lastTargetHit).toBe(id);
    expect(active.pitchState).toBe("flight");
    expect(active.targetReaction).toBeGreaterThan(0);
    expect(active.targetStates[id].hit).toBe(true);
    expect(active.score).toBe(0); // Award after the complete reaction, once.
    const target = TARGETS.find((t) => t.id === id)!;
    await expect(page.locator("#announcement-text")).toContainText(
      target.message,
    );
    await expect(page.locator("#announcement-text")).toContainText(
      target.label,
    );
    await page.screenshot({ path: `test-results/target-${id}.png` });
    await page.clock.runFor(2200);
    const finished = await page.evaluate(() =>
      window.__HOME_RUN_CHAOS__.getState(),
    );
    expect(finished.hits).toHaveLength(1);
    const summary = finished.hits[0];
    expect(summary.points).toBe(
      scoreHit(
        summary.distance,
        finished.homeRunCount === 1,
        0,
        false,
        id,
        true,
      ).points,
    );
    expect(finished.score).toBe(summary.points);
    await page.clock.runFor(200);
    expect(
      (await page.evaluate(() => window.__HOME_RUN_CHAOS__.getState())).score,
    ).toBe(finished.score);
    await page.evaluate(() => window.__HOME_RUN_CHAOS__.predictablePitch());
    const reset = await page.evaluate(() =>
      window.__HOME_RUN_CHAOS__.getState(),
    );
    expect(reset.targetStates[id].reaction).toBe(0);
    expect(reset.targetStates[id].hit).toBe(false);
    if (target.permanent) {
      expect(reset.targetStates[id].damaged).toBe(true);
      expect(reset.targetStates[id].scale[1]).toBeLessThan(0.1);
      await page.evaluate(() => window.__HOME_RUN_CHAOS__.startRound());
      expect(
        (await page.evaluate(() => window.__HOME_RUN_CHAOS__.getState()))
          .targetStates[id].damaged,
      ).toBe(false);
    }
    if (id === "lights") expect(reset.targetStates.lights.lights).toBe(1.2);
  });
}
test("the flush spirals toward the drain, and pause freezes the entire reaction", async ({
  page,
}) => {
  await page.evaluate(() => window.__HOME_RUN_CHAOS__.launchAtTarget("toilet"));
  await page.clock.runFor(2200);
  const a = await page.evaluate(() => window.__HOME_RUN_CHAOS__.getState());
  expect(a.lastTargetHit).toBe("toilet");
  await page.keyboard.press("p");
  await page.clock.runFor(1000);
  const paused = await page.evaluate(() =>
    window.__HOME_RUN_CHAOS__.getState(),
  );
  expect(paused.ballPosition).toEqual(a.ballPosition);
  expect(paused.targetReaction).toBe(a.targetReaction);
  await page.keyboard.press("p");
  await page.clock.runFor(Math.floor((a.targetReaction - 0.25) * 1000));
  const b = await page.evaluate(() => window.__HOME_RUN_CHAOS__.getState());
  const toilet = TARGETS.find((t) => t.id === "toilet")!.position;
  const radius = (p: typeof a.ballPosition) =>
    Math.hypot(p.x - toilet.x, p.z - toilet.z + 1);
  expect(radius(b.ballPosition)).toBeLessThan(radius(a.ballPosition));
  expect(b.ballPosition.y).toBeLessThan(a.ballPosition.y);
  expect(b.ballScale).toBeLessThan(1);
});
test("dim lights stay dim until the next pitch", async ({ page }) => {
  await page.evaluate(() => window.__HOME_RUN_CHAOS__.launchAtTarget("lights"));
  await page.clock.runFor(2800);
  expect(
    (await page.evaluate(() => window.__HOME_RUN_CHAOS__.getState()))
      .targetStates.lights.lights,
  ).toBeLessThan(0.1);
  await page.clock.runFor(700);
  expect(
    (await page.evaluate(() => window.__HOME_RUN_CHAOS__.getState()))
      .targetStates.lights.lights,
  ).toBeLessThan(0.1);
  await page.evaluate(() => window.__HOME_RUN_CHAOS__.predictablePitch());
  expect(
    (await page.evaluate(() => window.__HOME_RUN_CHAOS__.getState()))
      .targetStates.lights.lights,
  ).toBe(1.2);
});

// Exercise the production swing path, with a standard center pitch as the fixture.
// No forced contact, launch velocity, ball position, or score is used here.
for (const [id, error, aim] of [
  ["scoreboard", 0, -0.6007],
  ["lights", 0, 0.7042],
  ["toilet", 0, 0.256],
  ["baseball", 0, -0.9967],
  ["mascot", 0, 0.7882],
  ["hotdog", 0, -0.127],
  ["ufo", 0, 0.17],
] as const) {
  test(`perfect keyboard swing assists a collision with ${id}`, async ({
    page,
  }) => {
    await page.evaluate(() => window.__HOME_RUN_CHAOS__.predictablePitch());
    await page.clock.runFor(16); // Render the playing UI before aiming over the former menu.
    await page.mouse.move(1440 * (0.5 - aim / 2), 650);
    await page.clock.runFor(Math.round((1.45 + error) * 1000) - 16);
    await page.keyboard.press("Space");
    expect(
      (await page.evaluate(() => window.__HOME_RUN_CHAOS__.getState()))
        .pitchState,
    ).toBe("flight");
    await page.clock.runFor(3500);
    const hit = await page.evaluate(() => window.__HOME_RUN_CHAOS__.getState());
    expect(hit.lastTargetHit).toBe(id);
    expect(hit.targetStates[id].hit).toBe(true);
  });
}

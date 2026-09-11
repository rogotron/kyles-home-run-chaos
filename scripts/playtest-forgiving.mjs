// Simulated beginner: one real-time round, varied visible-ball cues, real keys.
// Reads diagnostics only; never forces pitches, timing, contact, or the clock.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const browser = await chromium.launch({
  args: ["--use-angle=d3d11", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const report = { swings: [], errors: [] };
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto("http://localhost:5173");
  await page.waitForFunction(() => !!window.__HOME_RUN_CHAOS__);
  await page.keyboard.press("Space");
  // Nine loose cues around the plate, including ~500 ms early/late attempts.
  // The final cue is deliberately much too early to verify misses still exist.
  const cueZ = [2.75, 1.75, 0.88, 1.18, 0.4, 2.04, 1.52, 0.72, 1.1, 7];
  let swungPitch = 0;
  const deadline = Date.now() + 110000;
  let result;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() =>
      window.__HOME_RUN_CHAOS__.getState(),
    );
    if (state.phase === "results") {
      result = state;
      break;
    }
    if (state.paused) throw new Error("Unexpected pause");
    if (
      state.pitchState === "pitching" &&
      state.ballPosition.y > 0 &&
      state.pitchNumber !== swungPitch &&
      state.ballPosition.z <= cueZ[state.pitchNumber - 1]
    ) {
      swungPitch = state.pitchNumber;
      await page.keyboard.press("Space");
      const swing = await page.evaluate(() =>
        window.__HOME_RUN_CHAOS__.getState(),
      );
      report.swings.push({
        pitch: swungPitch,
        cueZ: cueZ[swungPitch - 1],
        timingErrorMs: Math.round(swing.timingErrorMs),
        quality: swing.swingResult,
      });
    }
    await page.waitForTimeout(25);
  }
  if (!result) throw new Error("Round did not finish");
  report.pitches = result.pitchNumber;
  report.contacts = result.hits.filter((h) =>
    ["Early", "Good", "Perfect", "Late"].includes(h.quality),
  ).length;
  report.perfects = result.hits.filter((h) => h.quality === "Perfect").length;
  report.score = result.score;
  report.outcomes = result.hits;
  await mkdir(".local", { recursive: true });
  await page.screenshot({ path: ".local/forgiving-round-result.png" });
  await writeFile(
    ".local/forgiving-round-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (
    report.pitches !== 10 ||
    result.hits.length !== 10 ||
    report.swings.length !== 10 ||
    report.contacts < 9 ||
    report.perfects < 3 ||
    report.errors.length ||
    report.swings.at(-1).quality !== "Too early"
  ) {
    throw new Error(
      "Beginner simulation did not meet 9/10 contact and 3+ perfect acceptance criteria",
    );
  }
} finally {
  await browser.close();
}

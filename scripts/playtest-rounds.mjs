// Ten-pitch round playtest: actual mouse/keyboard inputs, automatic pitches, no mutation hooks.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  args: ["--use-angle=d3d11", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const report = { rounds: [], errors: [], warnings: [], frames: [] };
page.on("pageerror", (e) => report.errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") report.errors.push(m.text());
  if (m.type() === "warning") report.warnings.push(m.text());
});
await mkdir(".local", { recursive: true });
await page.goto("http://localhost:5173");
await page.waitForFunction(() => !!window.__HOME_RUN_CHAOS__);
await page.locator("#versus-mode").click();
await page.locator("#play").click();
for (let round = 0; round < 3; round++) {
  const start = Date.now();
  const hits = [];
  let swung = false,
    previous = "ready",
    gold = false,
    shot = false;
  let deadline = Date.now() + 100000;
  while (Date.now() < deadline) {
    const s = await page.evaluate(() => window.__HOME_RUN_CHAOS__.getState());
    if (s.phase !== "playing") {
      report.rounds.push({
        round: round + 1,
        player: s.currentPlayer,
        seconds: (Date.now() - start) / 1000,
        score: s.score,
        homeRuns: s.homeRunCount,
        highScore: s.records.highScore,
        pitches: s.pitchNumber,
        outcomes: s.hits.length,
        hits,
      });
      await page.screenshot({ path: `.local/round-${round + 1}-result.png` });
      break;
    }
    if (s.paused)
      throw new Error("Unexpected pause during real-control playtest");
    if (s.pitchState === "ready" && previous !== "ready") {
      swung = false;
      const aims = [0.57, -0.49, 0.05, -0.93, 0.23, -0.1, 0];
      const aim = aims[hits.length % aims.length];
      await page.mouse.move(1440 * (0.5 - aim / 2), 460);
    }
    if (s.pitchState === "pitching" && !swung) {
      const thresholds = [0.98, 0.93, 1.035, 1.12, 0.86, 1.01, 0.74];
      if (s.pitchProgress >= thresholds[hits.length % thresholds.length]) {
        await page.keyboard.press("Space");
        swung = true;
        const hit = await page.evaluate(() =>
          window.__HOME_RUN_CHAOS__.getState(),
        );
        hits.push({
          quality: hit.swingResult,
          aim: hit.aim,
          golden: hit.golden,
        });
      }
    }
    if (s.pitchState === "flight" && !shot && s.ballPosition.z > 24) {
      shot = true;
      await page.screenshot({ path: `.local/round-${round + 1}-flight.png` });
    }
    if (
      s.lastTargetHit &&
      hits.length &&
      ["Good", "Perfect", "Early", "Late"].includes(s.swingResult) &&
      ["flight", "result"].includes(s.pitchState)
    )
      hits[hits.length - 1].target = s.lastTargetHit;
    if (s.golden && !gold) {
      gold = true;
      await page.screenshot({ path: `.local/round-${round + 1}-gold.png` });
    }
    previous = s.pitchState;
    await page.waitForTimeout(25);
  }
  if (report.rounds.length !== round + 1)
    throw new Error("A round failed to finish in real time");
  console.log("ROUND", JSON.stringify(report.rounds[round]));
  if (round === 0) await page.locator("#next").click();
  if (round === 1) {
    await page.locator("#home").click();
    await page.locator("#solo-mode").click();
    await page.keyboard.press("Space");
  }
}
await writeFile(".local/playtest-report.json", JSON.stringify(report, null, 2));
await browser.close();
if (report.errors.length) throw new Error(report.errors.join("\n"));
if (
  report.rounds.some(
    (r) =>
      r.score === 0 ||
      r.pitches !== 10 ||
      r.outcomes !== 10 ||
      r.hits.length !== 10,
  )
)
  throw new Error("Insufficient successful gameplay");
console.log("Three complete rounds passed using real controls.");

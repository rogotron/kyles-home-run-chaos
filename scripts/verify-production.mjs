import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  args: ["--use-angle=d3d11", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const url = process.argv[2] ?? "http://localhost:4173";
await page.goto(url);
await page.locator("#play").waitFor({ state: "visible" });
if (await page.evaluate(() => typeof window.__HOME_RUN_CHAOS__ !== "undefined"))
  throw new Error("Development hooks leaked into production");
await page.keyboard.press("Space");
// Real keyboard timing: first pitch follows the 1.1-second windup.
await page.waitForTimeout(2550);
await page.keyboard.press("Space");
await page.waitForFunction(
  () =>
    Number(document.querySelector("#score")?.textContent?.replaceAll(",", "")) >
    0,
);
const score = await page.locator("#score").innerText();
await mkdir(".local", { recursive: true });
await page.screenshot({ path: ".local/production-play.png" });
const fps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let previous = performance.now();
      const frames = [];
      function tick(now) {
        frames.push(now - previous);
        previous = now;
        if (frames.length < 150) requestAnimationFrame(tick);
        else {
          const sorted = frames.slice(10).sort((a, b) => a - b);
          resolve({
            average: Math.round(
              1000 / (sorted.reduce((a, b) => a + b, 0) / sorted.length),
            ),
            p95FrameMs: Math.round(sorted[Math.floor(sorted.length * 0.95)]),
          });
        }
      }
      requestAnimationFrame(tick);
    }),
);
const report = {
  url,
  score,
  developmentHooksAbsent: true,
  consoleErrors: errors,
  performance: fps,
};
console.log("PRODUCTION", JSON.stringify(report));
await writeFile(
  ".local/production-report.json",
  JSON.stringify(report, null, 2),
);
await browser.close();
if (errors.length) throw new Error(errors.join("\n"));

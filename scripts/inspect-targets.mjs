import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  args: ["--use-angle=d3d11", "--enable-webgl", "--ignore-gpu-blocklist"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173");
  await page.waitForFunction(() => !!window.__HOME_RUN_CHAOS__);
  await mkdir(".local/targets", { recursive: true });
  await page.screenshot({ path: ".local/targets/stadium-menu.png" });
  await page.keyboard.press("Space");
  await page.waitForFunction(
    () => window.__HOME_RUN_CHAOS__.getState().cameraZoom > 1.39,
  );
  await page.screenshot({ path: ".local/targets/stadium-batting.png" });
  const inspectionIds = process.argv.includes("--overview-only")
    ? []
    : ["scoreboard", "lights", "toilet", "baseball", "mascot", "sock"];
  for (const id of inspectionIds) {
    await page.evaluate(
      (id) => window.__HOME_RUN_CHAOS__.launchAtTarget(id),
      id,
    );
    await page.waitForFunction(
      (id) => window.__HOME_RUN_CHAOS__.getState().lastTargetHit === id,
      id,
      { timeout: 12000 },
    );
    await page.waitForTimeout(850);
    await page.screenshot({ path: `.local/targets/${id}.png` });
    console.log(
      id,
      JSON.stringify(
        await page.evaluate(
          () => window.__HOME_RUN_CHAOS__.getState().targetStates,
        ),
      ),
    );
  }
  console.log("ERRORS", errors);
} finally {
  await browser.close();
}

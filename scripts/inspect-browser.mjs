import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  args: ["--use-angle=d3d11", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on("console", (m) => {
  if (["error", "warning", "warn"].includes(m.type())) logs.push(m.text());
});
page.on("pageerror", (e) => logs.push(e.message));
await page.goto("http://localhost:5173");
await page.waitForFunction(() => !!window.__HOME_RUN_CHAOS__);
console.log(
  "GPU",
  await page.evaluate(() => {
    const gl = document.querySelector("canvas").getContext("webgl2");
    const e = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      renderer: gl.getParameter(e.UNMASKED_RENDERER_WEBGL),
      vendor: gl.getParameter(e.UNMASKED_VENDOR_WEBGL),
    };
  }),
);
await mkdir(".local", { recursive: true });
await page.screenshot({ path: ".local/menu.png" });
await page.keyboard.press("Space");
await page.waitForFunction(() => {
  const s = window.__HOME_RUN_CHAOS__.getState();
  return s.pitchState === "pitching" && s.pitchProgress > 0.4;
});
console.log(
  "FRAMING",
  await page.evaluate(() => window.__HOME_RUN_CHAOS__.getFraming()),
);
await page.screenshot({ path: ".local/clarity-batting.png" });
await page.waitForFunction(() => {
  const s = window.__HOME_RUN_CHAOS__.getState();
  return s.pitchState === "pitching" && s.pitchProgress > 0.94;
});
await page.keyboard.press("Space");
console.log(
  "CONTACT",
  await page.evaluate(() => window.__HOME_RUN_CHAOS__.getState()),
);
await page.waitForTimeout(700);
await page.screenshot({ path: ".local/flight.png" });
await page.waitForFunction(
  () => window.__HOME_RUN_CHAOS__.getState().score > 0,
  {},
  { timeout: 20000 },
);
console.log(
  "RESULT",
  await page.evaluate(() => window.__HOME_RUN_CHAOS__.getState()),
);
console.log("LOGS", logs);
await browser.close();

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const stage = process.argv[2] || "after";
const output = `artifacts/visuals/${stage}`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-angle=d3d11", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const errors = [],
  requests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("response", (r) => {
  if (r.url().includes("/assets/models/"))
    requests.push({ url: r.url(), status: r.status() });
});
await page.goto("http://127.0.0.1:5173/?timingDebug=0");
await page.waitForFunction(() => !!window.__HOME_RUN_CHAOS__);
const performanceReport = await page.evaluate(async () => {
  const gl = document.querySelector("#game").getContext("webgl2");
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const samples = [];
  let last;
  await new Promise((resolve) => {
    function tick(now) {
      if (last) samples.push(now - last);
      last = now;
      if (samples.length < 180) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });
  const frames = samples.slice(30).sort((a, b) => a - b);
  return {
    gpu: ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
    fps: 1000 / (frames.reduce((a, b) => a + b, 0) / frames.length),
    p95FrameMs: frames[Math.floor(frames.length * 0.95)],
  };
});
await page.clock.install();
await page.clock.pauseAt(new Date(Date.now() + 100));
await page.clock.runFor(500);
await page.screenshot({ path: `${output}/stadium.png` });
await page.evaluate(() => window.__HOME_RUN_CHAOS__.startRound());
await page.clock.runFor(1900);
await page.screenshot({ path: `${output}/batting.png` });
await page.evaluate(() => window.__HOME_RUN_CHAOS__.launchAtTarget("dinosaur"));
await page.clock.runFor(1800);
await page.screenshot({ path: `${output}/dinosaur.png` });
const state = await page.evaluate(() => window.__HOME_RUN_CHAOS__.getState());
await page.clock.runFor(600);
await page.screenshot({ path: `${output}/dinosaur-focus.png` });
await page.clock.runFor(4000);
const result = await page.evaluate(() => window.__HOME_RUN_CHAOS__.getState());
const report = {
  ...performanceReport,
  render: await page.evaluate(() => window.__HOME_RUN_CHAOS__.getVisualState?.() ?? null),
  errors,
  requests,
  camera: state.cameraPosition,
  target: result.lastTargetHit,
  score: result.score,
};
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (errors.length) throw new Error(errors.join("\n"));

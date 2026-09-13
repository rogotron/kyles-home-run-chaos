import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const stage = process.argv[2] || "after";
const base = process.env.TARGET_URL || "http://127.0.0.1:5173";
const out = `artifacts/targets/${stage}`;
await mkdir(out, { recursive: true });
const ids = process.argv.length > 3 ? process.argv.slice(3) : [
  "dinosaur",
  "toilet",
  "sock",
  "goal",
  "ufo",
  "scoreboard",
  "lights",
  "baseball",
  "mascot",
  "icecream",
];
const browser = await chromium.launch({
  args: ["--use-angle=d3d11", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const report = {};
for (const [name, width, height] of [
  ["desktop", 1440, 900],
  ["mobile", 390, 844],
]) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (/assets\/(models|targets)\//.test(r.url()))
      requests.push({ url: r.url(), status: r.status() });
  });
  await page.addInitScript(() => {
    let seed = 1234;
    Math.random = () =>
      (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
  });
  await page.goto(base + "/?timingDebug=0");
  await page.waitForFunction(() => !!window.__HOME_RUN_CHAOS__);
  // Real requestAnimationFrame timings, without Playwright's virtual clock.
  const perf = await page.evaluate(async () => {
    const gl = document.querySelector("#game").getContext("webgl2"),
      ext = gl.getExtension("WEBGL_debug_renderer_info");
    const a = [];
    let last;
    await new Promise((resolve) => {
      function tick(t) {
        if (last) a.push(t - last);
        last = t;
        if (a.length < 210) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });
    const samples = a.slice(30).sort((a, b) => a - b);
    return {
      gpu: ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL),
      frames: samples.length,
      meanMs: samples.reduce((a, b) => a + b) / samples.length,
      p95Ms: samples[Math.floor(samples.length * 0.95)],
    };
  });
  await page.clock.install();
  await page.clock.pauseAt(
    new Date((await page.evaluate(() => Date.now())) + 100),
  );
  await page.evaluate(() => window.__HOME_RUN_CHAOS__.startRound());
  await page.clock.runFor(1900);
  await page.screenshot({ path: `${out}/${name}-gameplay.png` });
  const visual = await page.evaluate(() =>
    window.__HOME_RUN_CHAOS__.getVisualState(),
  );
  const hits = {};
  for (const id of ids) {
    await page.evaluate(() => window.__HOME_RUN_CHAOS__.startRound());
    await page.evaluate(
      (id) => window.__HOME_RUN_CHAOS__.launchAtTarget(id),
      id,
    );
    await page.clock.runFor(1450);
    await page.screenshot({ path: `${out}/${name}-${id}-intact.png` });
    const preview = await page.evaluate(
      (id) => window.__HOME_RUN_CHAOS__.getVisualState().targetAssets?.[id],
      id,
    );
    if (preview) {
      const b = preview.bounds,
        pad = 14;
      const x = Math.max(0, Math.floor(b.left - pad)),
        y = Math.max(0, Math.floor(b.top - pad));
      const w = Math.min(width - x, Math.ceil(b.right + pad) - x),
        h = Math.min(height - y, Math.ceil(b.bottom + pad) - y);
      if (w > 0 && h > 0)
        await page.screenshot({
          path: `${out}/${name}-${id}-crop.png`,
          clip: { x, y, width: w, height: h },
        });
    }
    await page.clock.runFor(850);
    const active = await page.evaluate(() => ({
      state: window.__HOME_RUN_CHAOS__.getState(),
      visual: window.__HOME_RUN_CHAOS__.getVisualState(),
    }));
    await page.screenshot({ path: `${out}/${name}-${id}.png` });
    await page.clock.runFor(2200);
    const settled = await page.evaluate(() =>
      window.__HOME_RUN_CHAOS__.getState(),
    );
    hits[id] = {
      hit: active.state.lastTargetHit,
      reacting: active.state.targetReaction > 0,
      score: settled.score,
      hits: settled.hits.length,
      camera: active.state.cameraPosition,
      preview,
      render: active.visual,
    };
    if (active.state.lastTargetHit !== id || settled.hits.length !== 1)
      errors.push(`Failed ${id} collision/reaction`);
    if (stage === "after" && !active.visual.targetAssets?.[id]?.integrated)
      errors.push(`GLB not integrated: ${id}`);
  }
  report[name] = { perf, visual, hits, errors, requests };
  console.log(
    name,
    JSON.stringify({
      perf,
      drawCalls: visual.drawCalls,
      triangles: visual.triangles,
      errors,
    }),
  );
  await page.close();
}
await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
await browser.close();
if (Object.values(report).some((r) => r.errors.length)) process.exitCode = 1;

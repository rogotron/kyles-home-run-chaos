import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  args: ["--use-angle=d3d11", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
await page.goto("http://127.0.0.1:5173/?timingDebug=0");
await page.waitForFunction(() => !!window.__HOME_RUN_CHAOS__);
await page.clock.install();
await page.clock.pauseAt(
  new Date((await page.evaluate(() => Date.now())) + 1000),
);
await page.evaluate(() => window.__HOME_RUN_CHAOS__.startRound());
await page.clock.runFor(1900);
const state = await page.evaluate(() =>
  window.__HOME_RUN_CHAOS__.getVisualState(),
);
console.log(JSON.stringify(state.composition.labels));
await mkdir(".local/layout-tour", { recursive: true });
await writeFile(".local/layout-labels.json", JSON.stringify(state, null, 2));
const targets = [
  "icecream",
  "goal",
  "ufo",
  "dinosaur",
  "toilet",
  "scoreboard",
  "lights",
  "baseball",
  "mascot",
  "sock",
];
for (const target of targets) {
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#123849;color:#fff5d8;font:18px system-ui}h1{margin:20px}main{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}figure{margin:0}img{display:block;width:100%}figcaption{padding:6px}</style><h1>${target.toUpperCase()} · flight, reaction and return</h1><main>${Array.from({ length: 10 }, (_, i) => `<figure><img src="${target}-${(i + 1) * 600}.png"><figcaption>${((i + 1) * 0.6).toFixed(1)} s</figcaption></figure>`).join("")}</main>`;
  await writeFile(`.local/layout-tour/${target}.html`, html);
  await page.goto(`http://127.0.0.1:5173/.local/layout-tour/${target}.html`);
  await page
    .locator("img")
    .evaluateAll((images) =>
      Promise.all(images.map((image) => image.decode())),
    );
  await page.screenshot({
    path: `artifacts/visuals/layout-after/tour-${target}.png`,
    fullPage: true,
  });
}
await browser.close();

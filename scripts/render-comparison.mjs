import { chromium } from "@playwright/test";
const prefix = process.argv[2] || "comparison";
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1600, height: 1100 },
  deviceScaleFactor: 1,
});
await page.goto(`http://127.0.0.1:5173/artifacts/visuals/${prefix}.html`);
await page.evaluate(() =>
  Promise.all([...document.images].map((img) => img.decode())),
);
await page.screenshot({
  path: `artifacts/visuals/${prefix}.png`,
  fullPage: true,
});
for (const name of ["batting", "dinosaur"])
  await page
    .locator(`#${name}`)
    .screenshot({ path: `artifacts/visuals/${prefix}-${name}.png` });
await browser.close();

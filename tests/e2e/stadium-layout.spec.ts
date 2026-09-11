import { expect, test } from "@playwright/test";
import { TARGETS } from "../../src/types";

type Rect = { left: number; right: number; top: number; bottom: number };
const overlap = (a: Rect, b: Rect) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.goto("/?timingDebug=0");
  await page.waitForFunction(() => !!window.__HOME_RUN_CHAOS__);
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(new Date(now + 1000));
});

for (const [width, height] of [
  [1280, 720],
  [1440, 900],
  [1920, 1080],
  [1024, 768],
]) {
  test(`stadium corners and label spacing at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.__HOME_RUN_CHAOS__.startRound());
    await page.clock.runFor(1900);
    const visual = await page.evaluate(() =>
      window.__HOME_RUN_CHAOS__.getVisualState(),
    );
    for (const pole of visual.layout.poles)
      for (const [x, y] of pole) {
        expect(x).toBeGreaterThan(24);
        expect(x).toBeLessThan(width - 24);
        expect(y).toBeGreaterThan(96);
        expect(y).toBeLessThan(height - 30);
      }
    expect(visual.layout.crowdMinimumRadius).toBeGreaterThan(121);
    const labels = visual.composition.labels.filter(
      (p) => p.visible && p.opacity > 0.5,
    );
    expect(labels.length).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < labels.length; i++) {
      for (const obstacle of visual.composition.obstacles)
        expect(overlap(labels[i].bounds!, obstacle)).toBe(false);
      for (const other of labels.slice(i + 1))
        expect(overlap(labels[i].bounds!, other.bounds!)).toBe(false);
    }
    await page.screenshot({
      path: `artifacts/visuals/layout-after/batting-${width}x${height}.png`,
    });
  });
}

test("exported chalk lies flat and ends at two symmetric wall-mounted foul poles", async ({
  page,
}) => {
  const geometry = await page.evaluate(async () => {
    const assetPath = "/src/visual-assets.ts",
      threePath = "/node_modules/three/build/three.module.js";
    const { loadVisualAssets } = await import(assetPath);
    const THREE = await import(threePath);
    const assets = await loadVisualAssets();
    const points = (asset: any, material: string) => {
      const result: number[][] = [];
      asset.updateMatrixWorld(true);
      asset.traverse((o: any) => {
        if (!o.isMesh || o.material.name !== material) return;
        const attribute = o.geometry.getAttribute("position");
        for (let i = 0; i < attribute.count; i++) {
          const p = new THREE.Vector3()
            .fromBufferAttribute(attribute, i)
            .applyMatrix4(o.matrixWorld);
          result.push(p.toArray());
        }
      });
      return result;
    };
    const chalk = points(assets.field, "cream").filter(
      ([x, , z]) => Math.abs(x) > 2 && Math.abs(Math.abs(x) - z) < 0.15,
    );
    const poles = points(assets.stadium, "foul_yellow");
    return [-1, 1].map((side) => {
      const end = chalk.filter(
        ([x, , z]) => x * side > 0 && Math.hypot(x, z) > 70,
      );
      const base = poles.filter(([x, y]) => x * side > 0 && y < 0.3);
      return {
        chalkYs: chalk.map((p) => p[1]),
        end: [0, 2].map(
          (axis) => end.reduce((sum, p) => sum + p[axis], 0) / end.length,
        ),
        base: [0, 2].map(
          (axis) =>
            (Math.min(...base.map((p) => p[axis])) +
              Math.max(...base.map((p) => p[axis]))) /
            2,
        ),
        height: Math.max(...poles.map((p) => p[1])),
      };
    });
  });
  for (const [i, g] of geometry.entries()) {
    expect(g.chalkYs.length).toBeGreaterThan(0);
    for (const y of g.chalkYs) expect(y).toBeCloseTo(0.082, 3);
    expect(g.base[0]).toBeCloseTo(((i === 0 ? -1 : 1) * 72) / Math.sqrt(2), 3);
    expect(g.base[1]).toBeCloseTo(72 / Math.sqrt(2), 3);
    expect(g.end[0]).toBeCloseTo(g.base[0], 3);
    expect(g.end[1]).toBeCloseTo(g.base[1], 3);
    expect(g.height).toBeGreaterThanOrEqual(24);
    expect(g.height).toBeLessThan(24.1);
  }
});

for (const target of TARGETS) {
  test(`${target.id} camera tour preserves clear labels through flight, reaction and return`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.evaluate(() => window.__HOME_RUN_CHAOS__.startRound());
    await page.clock.runFor(1900);
    await page.evaluate(
      (id) => window.__HOME_RUN_CHAOS__.launchAtTarget(id),
      target.id,
    );
    for (let step = 1; step <= 30; step++) {
      const resize = {
        10: [1280, 720],
        16: [1024, 768],
        22: [1920, 1080],
        28: [1440, 900],
      }[step];
      if (resize)
        await page.setViewportSize({ width: resize[0], height: resize[1] });
      await page.clock.runFor(200);
      const composition = await page.evaluate(
        () => window.__HOME_RUN_CHAOS__.getVisualState().composition,
      );
      const labels = composition.labels.filter((p) => p.visible);
      for (let i = 0; i < labels.length; i++) {
        for (const obstacle of composition.obstacles)
          expect(overlap(labels[i].bounds!, obstacle)).toBe(false);
        for (const other of labels.slice(i + 1))
          expect(overlap(labels[i].bounds!, other.bounds!)).toBe(false);
      }
      if (step % 3 === 0)
        await page.screenshot({
          path: `.local/layout-tour/${target.id}-${step * 200}.png`,
        });
    }
    const state = await page.evaluate(() =>
      window.__HOME_RUN_CHAOS__.getState(),
    );
    expect(state.lastTargetHit).toBe(target.id);
    expect(state.score).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}

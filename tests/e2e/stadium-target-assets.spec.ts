import { expect, test } from "@playwright/test";
import { TARGETS } from "../../src/types";

test("ten target GLBs have valid pivots, colors, normals and mobile-sized geometry", async ({
  request,
}) => {
  let triangles = 0,
    draws = 0,
    bytes = 0;
  for (const target of TARGETS) {
    const response = await request.get(`/assets/targets/${target.id}.glb`);
    expect(response.ok()).toBe(true);
    const data = await response.body();
    bytes += data.length;
    const gltf = JSON.parse(
      data.subarray(20, 20 + data.readUInt32LE(12)).toString(),
    );
    const binStart = 20 + data.readUInt32LE(12) + 8;
    expect(gltf.images ?? []).toHaveLength(0);
    expect(gltf.buffers.every((b: { uri?: string }) => !b.uri)).toBe(true);
    const root = gltf.nodes.find((n: any) => n.extras?.targetRole === "Root");
    expect(root.translation ?? [0, 0, 0]).toEqual([0, 0, 0]);
    expect(root.scale ?? [1, 1, 1]).toEqual([1, 1, 1]);
    const roles = gltf.nodes.map((n: any) => n.extras?.targetRole);
    expect(roles).toContain("Static");
    expect(roles).toContain(target.id === "dinosaur" ? "Head" : "Moving");
    if (target.id === "dinosaur") {
      const head = gltf.nodes.find((n: any) => n.extras?.targetRole === "Head");
      const jaw = gltf.nodes.find((n: any) => n.extras?.targetRole === "Jaw");
      expect(head.translation).toEqual([0, 16, 0]);
      expect(jaw.translation[1]).toBe(-2);
    }
    for (const material of gltf.materials) {
      expect(material.alphaMode ?? "OPAQUE").toBe("OPAQUE");
      expect(material.doubleSided ?? false).toBe(false);
      expect(
        material.pbrMetallicRoughness.roughnessFactor,
      ).toBeGreaterThanOrEqual(0.2);
    }
    for (const mesh of gltf.meshes)
      for (const primitive of mesh.primitives) {
        draws++;
        triangles += gltf.accessors[primitive.indices].count / 3;
        expect(primitive.attributes.COLOR_0).toBeDefined();
        const normal = gltf.accessors[primitive.attributes.NORMAL];
        expect(normal.componentType).toBe(5126);
        const bv = gltf.bufferViews[normal.bufferView];
        const start =
            binStart + (bv.byteOffset ?? 0) + (normal.byteOffset ?? 0),
          stride = bv.byteStride ?? 12;
        let minLength = Infinity,
          maxLength = 0;
        for (let i = 0; i < normal.count; i++) {
          const at = start + i * stride;
          const length = Math.hypot(
            data.readFloatLE(at),
            data.readFloatLE(at + 4),
            data.readFloatLE(at + 8),
          );
          minLength = Math.min(minLength, length);
          maxLength = Math.max(maxLength, length);
        }
        expect(minLength).toBeGreaterThan(0.98);
        expect(maxLength).toBeLessThan(1.02);
      }
  }
  expect(triangles).toBeLessThan(80_000);
  expect(draws).toBeLessThanOrEqual(56);
  expect(bytes).toBeLessThan(4_000_000);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`all targets replace their render meshes and retain invisible proxies at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.waitForFunction(() => !!window.__HOME_RUN_CHAOS__);
    const visual = await page.evaluate(() =>
      window.__HOME_RUN_CHAOS__.getVisualState(),
    );
    for (const target of TARGETS) {
      const model = visual.targetAssets[target.id];
      expect(model.integrated, target.id).toBe(true);
      expect(model.proxiesHidden, target.id).toBe(true);
      expect(model.triangles).toBeGreaterThan(0);
      if (target.id !== "ufo")
        expect(model.position).toEqual([
          target.position.x,
          0,
          target.position.z,
        ]);
    }
  });
}

test("corrupt and missing target assets fall back independently and still score", async ({
  page,
}) => {
  await page.clock.install();
  await page.route("**/assets/targets/toilet.glb", (r) =>
    r.fulfill({ status: 200, body: "broken glb" }),
  );
  await page.route("**/assets/targets/scoreboard.glb", (r) =>
    r.fulfill({ status: 404, body: "" }),
  );
  await page.goto("/");
  await page.waitForFunction(() => !!window.__HOME_RUN_CHAOS__);
  await page.clock.pauseAt(new Date(Date.now() + 100));
  const visual = await page.evaluate(() =>
    window.__HOME_RUN_CHAOS__.getVisualState(),
  );
  expect(visual.targetAssets.toilet.integrated).toBe(false);
  expect(visual.targetAssets.scoreboard.integrated).toBe(false);
  expect(visual.targetAssets.dinosaur.integrated).toBe(true);
  for (const id of ["toilet", "scoreboard"] as const) {
    await page.evaluate(() => window.__HOME_RUN_CHAOS__.startRound());
    await page.evaluate(
      (id) => window.__HOME_RUN_CHAOS__.launchAtTarget(id),
      id,
    );
    await page.clock.runFor(4500);
    const state = await page.evaluate(() =>
      window.__HOME_RUN_CHAOS__.getState(),
    );
    expect(state.lastTargetHit).toBe(id);
    expect(state.score).toBeGreaterThan(4000);
  }
});

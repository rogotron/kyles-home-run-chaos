import { expect, test } from "@playwright/test";
import { MODEL_NAMES } from "../../src/visual-assets";

test("graphics polish keeps labels clear of the HUD and freezes the dinosaur cutaway on pause", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await page.waitForFunction(() => !!window.__HOME_RUN_CHAOS__);
  await page.clock.pauseAt(new Date(Date.now() + 100));
  await page.evaluate(() => window.__HOME_RUN_CHAOS__.startRound());
  await page.clock.runFor(1900);
  const hud = await page.locator("#hud").boundingBox();
  const original = await page.evaluate(
    () => window.__HOME_RUN_CHAOS__.getVisualState().composition,
  );
  expect(original.mascotOpacity).toBe(1);
  const visible = original.labels.filter(
    (label) => label.visible && label.opacity > 0.5,
  );
  expect(visible.length).toBeGreaterThanOrEqual(4);
  for (const label of visible) {
    const r = label.bounds!;
    expect(
      r.right <= hud!.x ||
        r.left >= hud!.x + hud!.width ||
        r.bottom <= hud!.y ||
        r.top >= hud!.y + hud!.height,
    ).toBe(true);
  }
  await page.evaluate(() =>
    window.__HOME_RUN_CHAOS__.launchAtTarget("dinosaur"),
  );
  await page.clock.runFor(2400);
  const reaction = await page.evaluate(() => ({
    state: window.__HOME_RUN_CHAOS__.getState(),
    visual: window.__HOME_RUN_CHAOS__.getVisualState().composition,
  }));
  expect(reaction.state.lastTargetHit).toBe("dinosaur");
  expect(reaction.visual.mascotOpacity).toBeLessThan(0.15);
  expect(reaction.visual.labels.every((label) => !label.visible)).toBe(true);
  await page.keyboard.press("p");
  await page.clock.runFor(500);
  expect(
    (
      await page.evaluate(
        () => window.__HOME_RUN_CHAOS__.getVisualState().composition,
      )
    ).mascotOpacity,
  ).toBe(reaction.visual.mascotOpacity);
  await page.keyboard.press("p");
  await page.clock.runFor(1700);
  expect(
    (await page.evaluate(() => window.__HOME_RUN_CHAOS__.getState())).score,
  ).toBe(6380);
  await page.evaluate(() => window.__HOME_RUN_CHAOS__.predictablePitch());
  await page.clock.runFor(700);
  expect(
    (
      await page.evaluate(
        () => window.__HOME_RUN_CHAOS__.getVisualState().composition,
      )
    ).mascotOpacity,
  ).toBeGreaterThan(0.99);
  await expect(page.locator("#hud .hud-stat")).toHaveCount(5);
});

test("GLBs are self-contained and remain within the vertical slice geometry budget", async ({
  request,
}) => {
  let triangles = 0;
  let primitives = 0;
  for (const name of MODEL_NAMES) {
    const response = await request.get(`/assets/models/${name}.glb`);
    expect(response.ok()).toBe(true);
    const data = await response.body();
    const decode = new TextDecoder();
    expect(decode.decode(data.subarray(0, 4))).toBe("glTF");
    const jsonLength = new DataView(
      data.buffer,
      data.byteOffset,
      data.byteLength,
    ).getUint32(12, true);
    const gltf = JSON.parse(decode.decode(data.subarray(20, 20 + jsonLength)));
    expect(gltf.images ?? []).toHaveLength(0);
    expect(gltf.buffers.every((buffer: { uri?: string }) => !buffer.uri)).toBe(
      true,
    );
    expect(
      gltf.nodes.some((node: { name?: string }) =>
        /collision/i.test(node.name ?? ""),
      ),
    ).toBe(false);
    for (const mesh of gltf.meshes) {
      for (const primitive of mesh.primitives) {
        triangles += gltf.accessors[primitive.indices].count / 3;
        primitives++;
      }
    }
  }
  expect(triangles).toBeLessThan(200_000);
  expect(primitives).toBeLessThanOrEqual(64);
});

test("all seven models load before startup and preserve contact and golden-ball visuals", async ({
  page,
}) => {
  const errors: string[] = [];
  const remote: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:5173") &&
      !r.url().startsWith("data:")
    )
      remote.push(r.url());
  });
  await page.clock.install();
  await page.goto("/");
  await page.waitForFunction(() => !!window.__HOME_RUN_CHAOS__);
  await page.clock.pauseAt(new Date(Date.now() + 100));
  const visual = await page.evaluate(() =>
    window.__HOME_RUN_CHAOS__.getVisualState(),
  );
  expect(visual.loaded.sort()).toEqual([...MODEL_NAMES].sort());
  expect(visual.batter).toBe("blender-batter");
  expect(visual.dinoHead).toEqual([0, 16, 0]);
  await expect(page.locator(".loading")).toHaveCount(0);
  for (const ms of [-180, 0, 180]) {
    const contact = await page.evaluate((error) => {
      const game = window.__HOME_RUN_CHAOS__;
      game.testSwing(error);
      return { state: game.getState(), visual: game.getVisualState() };
    }, ms);
    for (let i = 0; i < 3; i++) {
      expect(contact.visual.hand[i]).toBeCloseTo(contact.visual.handle[i], 5);
      expect(contact.state.barrelPosition[i]).toBeCloseTo(
        Object.values(contact.state.ballPosition)[i],
        5,
      );
    }
  }
  await page.evaluate(() => {
    const game = window.__HOME_RUN_CHAOS__;
    game.startRound();
    for (let i = 0; i < 8; i++) game.triggerContact("Miss");
    game.predictablePitch();
  });
  await page.clock.runFor(100);
  expect(
    (await page.evaluate(() => window.__HOME_RUN_CHAOS__.getVisualState()))
      .ballColor,
  ).toBe("ffd04f");
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});

test("slow assets remain behind the loading screen until the complete scene is ready", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/assets/models/dinosaur.glb", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".loading")).toBeVisible();
  expect(await page.evaluate(() => !!window.__HOME_RUN_CHAOS__)).toBe(false);
  release();
  await page.waitForFunction(() => !!window.__HOME_RUN_CHAOS__);
  await expect(page.locator(".loading")).toHaveCount(0);
  expect(
    (await page.evaluate(() => window.__HOME_RUN_CHAOS__.getVisualState()))
      .loaded,
  ).toHaveLength(7);
});

test("unavailable assets retain playable procedural fallbacks for the entire round", async ({
  page,
}) => {
  await page.route("**/assets/models/*.glb", (route) =>
    route.fulfill({
      status: 200,
      contentType: "model/gltf-binary",
      body: "invalid model",
    }),
  );
  await page.goto("/");
  await page.waitForFunction(() => !!window.__HOME_RUN_CHAOS__);
  expect(
    (await page.evaluate(() => window.__HOME_RUN_CHAOS__.getVisualState()))
      .loaded,
  ).toEqual([]);
  await page.evaluate(() =>
    window.__HOME_RUN_CHAOS__.launchAtTarget("dinosaur"),
  );
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__HOME_RUN_CHAOS__.getState()))
          .lastTargetHit,
    )
    .toBe("dinosaur");
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.__HOME_RUN_CHAOS__.getState())).score,
    )
    .toBeGreaterThan(4000);
});

import { expect, test } from "@playwright/test";

for (const cores of [8, 2]) {
  test(`one soft key shadow and bounded quality with ${cores} CPU cores`, async ({
    page,
  }) => {
    // Inspect a renderer directly; no gameplay loop or physics is needed here.
    await page.route("**/src/main.ts", (route) =>
      route.fulfill({ contentType: "text/javascript", body: "export {};" }),
    );
    await page.addInitScript(
      (cores) =>
        Object.defineProperty(navigator, "hardwareConcurrency", {
          get: () => cores,
        }),
      cores,
    );
    await page.goto("/");
    const lighting = await page.evaluate(async () => {
      const modulePath = "/src/rendering.ts";
      const { Rendering } = await import(modulePath);
      const view = new Rendering(document.querySelector("canvas")!);
      view.update(1 / 60, {
        ball: { x: 0, y: 2, z: 12 },
        flight: false,
        pitching: false,
        progress: 0,
        aim: 0,
        golden: false,
        perfect: false,
        menu: true,
        visible: true,
        paused: false,
      });
      let shadowLights = 0,
        targetCasters = 0,
        playerCasters = 0;
      view.scene.traverse((object: any) => {
        if (object.isLight && object.castShadow) shadowLights++;
      });
      for (const target of view.targets.values())
        target.group.traverse((object: any) => {
          if (object.isMesh && object.castShadow) targetCasters++;
        });
      for (const player of [view.batter, view.pitcher])
        player.group.traverse((object: any) => {
          if (object.isMesh && object.castShadow) playerCasters++;
        });
      return {
        shadowLights,
        targetCasters,
        playerCasters,
        mapWidth: view.sun.shadow.map.width,
        mapSize: view.sun.shadow.mapSize.x,
        key: view.sun.intensity,
        fill: view.ambient.intensity,
        rimShadow: view.fill.castShadow,
        liveShadows: view.renderer.shadowMap.autoUpdate,
        crowdMaterial: view.crowdBodies.material.type,
      };
    });
    expect(lighting.shadowLights).toBe(1);
    expect(lighting.targetCasters).toBe(0);
    expect(lighting.playerCasters).toBeGreaterThan(0);
    expect(lighting.mapSize).toBe(cores === 2 ? 512 : 1024);
    expect(lighting.mapWidth).toBe(lighting.mapSize);
    expect(lighting.fill).toBeLessThan(lighting.key);
    expect(lighting.rimShadow).toBe(false);
    expect(lighting.liveShadows).toBe(true);
    expect(lighting.crowdMaterial).toBe("MeshLambertMaterial");
  });
}

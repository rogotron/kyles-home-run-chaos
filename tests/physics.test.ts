import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initPhysics, estimateLandingDistance } from "../src/physics";
import type { Physics } from "../src/physics";
import { CONTACT_Z } from "../src/batter";
import { exitVelocity, targetedExitVelocity } from "../src/batting";
import { TARGETS } from "../src/types";
import { Pitching } from "../src/pitching";
import { classifySwing } from "../src/scoring";
describe("real Rapier trajectories", () => {
  let physics: Physics;
  beforeAll(async () => {
    physics = await initPhysics();
  });
  afterAll(() => {
    physics.events.free();
    physics.world.free();
  });
  function swingAt(error: number, aim: number, x = 0, y = 1.65) {
    const pitching = new Pitching();
    pitching.start(true);
    pitching.location = { x, y };
    pitching.elapsed = pitching.contactTime + error;
    const position = pitching.position();
    physics.launch(
      position,
      targetedExitVelocity(
        classifySwing(error),
        aim,
        pitching.location,
        error,
        position,
      ),
    );
    let hit: string | null = null;
    for (let step = 0; step < 400 && !hit; step++)
      physics.step(1 / 60, (tag) => {
        if (
          !hit &&
          (TARGETS.some((target) => target.id === tag) ||
            ["ground", "wall", "stadium"].includes(tag))
        )
          hit = tag;
      });
    physics.hideBall();
    physics.step(1 / 60, () => {});
    return hit;
  }
  for (const target of TARGETS) {
    it(`perfect timing assists a real collision with ${target.name} across pitch locations`, () => {
      const aim =
        Math.atan2(target.position.x, target.position.z - CONTACT_Z) / 0.68;
      for (const [x, y] of [
        [-0.4, 1.4],
        [0, 1.65],
        [0.4, 1.9],
      ])
        expect(swingAt(0, aim, x, y)).toBe(target.id);
    });
  }
  it("increases actual target hit frequency as timing approaches perfect", () => {
    const rates = [0.5, 0.3, 0.15, 0].map((error) => {
      let hits = 0;
      for (const sign of [-1, 1])
        for (let i = 0; i <= 30; i++) {
          const hit = swingAt(sign * error, -1 + i / 15);
          if (TARGETS.some((target) => target.id === hit)) hits++;
        }
      return hits / 62;
    });
    console.log("Target hit rates (500 / 300 / 150 / 0 ms):", rates);
    expect(rates[3]).toBeGreaterThan(0.9);
    for (let i = 1; i < rates.length; i++)
      expect(rates[i]).toBeGreaterThan(rates[i - 1]);
  });
  for (const target of TARGETS) {
    it(`${target.name} is reachable with ordinary contact and legal aiming`, () => {
      // Measured legal batting profiles, using the actual pitch position and
      // timing classification, with all other targets/walls left in the world.
      const profiles: Record<string, [number, number, number]> = {
        pizza: [0.25, 1.4, -0.7947],
        goal: [-0.25, 1.4, -0.7399],
        ufo: [0, 1.4, 0],
        dinosaur: [-0.25, 1.65, 0.3489],
        toilet: [-0.25, 1.65, 0.0226],
        scoreboard: [0, 1.4, -0.3199],
        lights: [0, 1.4, -0.6374],
        baseball: [0, 1.4, -0.8883],
        mascot: [-0.25, 1.4, 0.515],
        hotdog: [-0.25, 1.65, -0.3631],
      };
      const [error, y, aim] = profiles[target.id];
      const pitching = new Pitching();
      pitching.start(true);
      pitching.location = { x: 0, y };
      pitching.elapsed = pitching.contactTime + error;
      physics.launch(
        pitching.position(),
        exitVelocity(classifySwing(error), aim, pitching.location, error),
      );
      let hit: string | null = null;
      for (let i = 0; i < 500 && !hit; i++)
        physics.step(1 / 60, (tag) => {
          if (TARGETS.some((t) => t.id === tag) || tag === "ground") hit = tag;
        });
      expect(hit).toBe(target.id);
      physics.hideBall();
      physics.step(1 / 60, () => {});
    });
  }
  it("gives a plausible landing estimate and rewards the perfect trajectory", () => {
    const p = { x: 0, y: 1.65, z: CONTACT_Z };
    const good = estimateLandingDistance(p, exitVelocity("Good", 0, p));
    const perfect = estimateLandingDistance(p, exitVelocity("Perfect", 0, p));
    expect(good).toBeGreaterThan(280);
    expect(good).toBeLessThan(400);
    expect(perfect).toBeGreaterThan(good + 50);
  });
  it("bounces a dynamic ball off the field", () => {
    physics.launch({ x: 0, y: 4, z: 12 }, { x: 0, y: -8, z: 0 });
    let ground = false;
    for (let i = 0; i < 30; i++)
      physics.step(1 / 60, (tag) => {
        if (tag === "ground") ground = true;
      });
    expect(ground).toBe(true);
    expect(physics.position().y).toBeGreaterThan(0);
  });
});

import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { initPhysics, type Physics } from "../src/physics";
import { TARGETS } from "../src/types";

describe("precise stadium target surfaces", () => {
  let physics: Physics;
  beforeAll(async () => {
    physics = await initPhysics();
  });
  afterAll(() => {
    physics.events.free();
    physics.world.free();
  });
  function send(
    p: { x: number; y: number; z: number },
    v: { x: number; y: number; z: number },
    frames = 30,
  ) {
    physics.hideBall();
    physics.step(1 / 60, () => {});
    physics.launch(p, v);
    const hits: string[] = [];
    for (let i = 0; i < frames; i++)
      physics.step(1 / 60, (tag) => {
        hits.push(tag);
      });
    return hits;
  }
  it("sweeps a fast ball across the thin scoreboard and scores its surface once", () => {
    const t = TARGETS.find((t) => t.id === "scoreboard")!;
    const hits = send(
      { x: t.position.x, y: t.position.y, z: t.position.z - 5 },
      { x: 0, y: 0, z: 900 },
      2,
    );
    expect(hits.filter((id) => id === "scoreboard")).toHaveLength(1);
  });
  it("does not award an inflatable hit inside an empty bounding-box corner", () => {
    const t = TARGETS.find((t) => t.id === "baseball")!;
    const hits = send(
      { x: t.position.x + 5.6, y: t.position.y + 5.6, z: t.position.z - 8 },
      { x: 0, y: 0, z: 40 },
      20,
    );
    expect(hits).not.toContain("baseball");
  });
  it("detects a ball dropping into the visible water and hitting the outside of the bowl", () => {
    const t = TARGETS.find((t) => t.id === "toilet")!;
    expect(
      send(
        { x: t.position.x, y: 11, z: t.position.z - 1 },
        { x: 0, y: -35, z: 0 },
        12,
      ),
    ).toContain("toilet");
    expect(
      send(
        { x: t.position.x - 8, y: 6, z: t.position.z - 1 },
        { x: 40, y: 0, z: 0 },
        12,
      ),
    ).toContain("toilet");
  });
  it("does not flush a ball flying through the empty space above the bowl", () => {
    const t = TARGETS.find((t) => t.id === "toilet")!;
    expect(
      send(
        { x: t.position.x - 8, y: 10, z: t.position.z - 3 },
        { x: 40, y: 0, z: 0 },
        12,
      ),
    ).not.toContain("toilet");
  });
  it("leaves damaged inflatables disabled across pitches and restores them for a new round", () => {
    const t = TARGETS.find((t) => t.id === "baseball")!;
    const p = { x: t.position.x, y: t.position.y, z: t.position.z - 8 };
    const v = { x: 0, y: 0, z: 40 };
    physics.damageTarget("baseball");
    physics.resetTargets();
    expect(send(p, v, 20)).not.toContain("baseball");
    physics.resetTargets(true);
    expect(send(p, v, 20)).toContain("baseball");
  });
});

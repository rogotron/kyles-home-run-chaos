import { describe, expect, it } from "vitest";
import { exitVelocity, targetedExitVelocity } from "../src/batting";
import { classifySwing } from "../src/scoring";
import { TARGETS } from "../src/types";

const position = { x: 0, y: 1.65, z: 1.4 };
describe("left-handed timing and target assistance", () => {
  it("sends very early contact to opposite left field and late contact to pull right field even against aim", () => {
    for (const aim of [-1, 0, 1]) {
      expect(
        targetedExitVelocity("Early", aim, position, -0.5, position).x,
      ).toBeGreaterThan(0);
      expect(
        targetedExitVelocity("Late", aim, position, 0.5, position).x,
      ).toBeLessThan(0);
    }
  });
  it("falls back to the natural trajectory when no active target is near the aim", () => {
    const lights = TARGETS.filter((target) => target.id === "lights");
    expect(
      targetedExitVelocity("Perfect", 0.8, position, 0, position, lights),
    ).toEqual(exitVelocity("Perfect", 0.8, position, 0));
    expect(
      targetedExitVelocity("Perfect", 0, position, 0, position, []),
    ).toEqual(exitVelocity("Perfect", 0, position, 0));
  });
  it("fades assistance smoothly through timing label boundaries", () => {
    for (const boundary of [-0.4, -0.2, 0, 0.2, 0.4]) {
      // Hold natural quality constant to isolate assistance from existing power tiers.
      const a = targetedExitVelocity(
        "Perfect",
        -0.6,
        position,
        boundary - 0.00001,
        position,
      );
      const b = targetedExitVelocity(
        "Perfect",
        -0.6,
        position,
        boundary + 0.00001,
        position,
      );
      expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(0.02);
    }
  });
  it("leaves early and late contact unassisted", () => {
    for (const error of [-0.6, -0.4, 0.4, 0.6]) {
      const quality = classifySwing(error);
      expect(
        targetedExitVelocity(quality, 0, position, error, position),
      ).toEqual(exitVelocity(quality, 0, position, error));
    }
  });
});

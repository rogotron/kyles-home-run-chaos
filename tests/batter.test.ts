import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { character } from "../src/models";
import { BATTER_STANCE, CONTACT_Z, poseSwing } from "../src/batter";
import { Pitching } from "../src/pitching";

function rig() {
  // Geometry tests need a label canvas, but no browser or GPU renderer.
  vi.stubGlobal("document", {
    createElement: () => ({
      getContext: () => ({
        beginPath() {},
        roundRect() {},
        fill() {},
        stroke() {},
        fillText() {},
      }),
    }),
  });
  const batter = character(new THREE.Scene());
  batter.group.position.set(BATTER_STANCE.x, BATTER_STANCE.y, BATTER_STANCE.z);
  batter.group.rotation.y = BATTER_STANCE.yaw;
  batter.group.scale.setScalar(BATTER_STANCE.scale);
  return batter;
}
afterEach(() => vi.unstubAllGlobals());

describe("batter stance and contact alignment", () => {
  it("keeps both feet inside the existing box and behind the plate front throughout a swing", () => {
    const batter = rig();
    for (const progress of [null, 0, 0.15, 0.4, 0.7, 1]) {
      poseSwing(batter, progress, { x: 0, y: 1.65, z: CONTACT_Z });
      batter.group.updateMatrixWorld(true);
      expect(batter.bat!.getWorldScale(new THREE.Vector3()).y).toBeCloseTo(
        1.12,
        6,
      );
      const bounds = new THREE.Box3();
      for (const foot of batter.group.children.filter(
        (child) => child.name === "foot",
      )) {
        const b = new THREE.Box3().setFromObject(foot);
        expect(b.min.x).toBeGreaterThan(-1.9);
        expect(b.max.x).toBeLessThan(-0.6);
        expect(b.min.z).toBeGreaterThan(-1);
        expect(b.max.z).toBeLessThan(1);
        bounds.union(b);
      }
      expect(bounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(0, 6);
      const plateFront = 0.75 / Math.sqrt(2);
      expect(plateFront - bounds.max.z).toBeGreaterThan(0.05);
      expect(-plateFront - bounds.max.x).toBeGreaterThan(0.3);
    }
  });
  it.each([
    [0, 1.65],
    [-0.4, 1.4],
    [0.4, 1.9],
  ])(
    "places the barrel and gripping hand at contact for pitch (%s, %s)",
    (x, y) => {
      const batter = rig();
      const target = new THREE.Vector3(x, y, CONTACT_Z);
      poseSwing(batter, 0, target);
      const barrel = batter.bat!.localToWorld(new THREE.Vector3(0, 1.1, 0));
      expect(barrel.distanceTo(target)).toBeLessThan(0.000001);
      const hand = batter.arm.localToWorld(new THREE.Vector3(0.12, -0.42, 0));
      expect(
        hand.distanceTo(batter.bat!.getWorldPosition(new THREE.Vector3())),
      ).toBeLessThan(0.000001);
    },
  );
  it("reaches the forward contact point 100 ms earlier than the old ideal", () => {
    const pitch = new Pitching();
    pitch.start(true);
    pitch.elapsed = pitch.contactTime;
    expect(pitch.duration).toBe(1.55);
    expect(pitch.contactTime).toBeCloseTo(1.45);
    expect(pitch.duration - pitch.contactTime).toBeCloseTo(0.1);
    expect(CONTACT_Z).toBeGreaterThan(0.75 / Math.sqrt(2));
    expect(pitch.position().x).toBe(0);
    expect(pitch.position().y).toBeCloseTo(1.65);
    expect(pitch.position().z).toBeCloseTo(CONTACT_Z);
  });
});

it.each([-180, -90, 0, 90, 180])(
  "aligns the bat to the actual ball at timing error %s ms",
  (ms) => {
    const batter = rig();
    const pitch = new Pitching();
    pitch.start(true);
    pitch.elapsed = pitch.contactTime + ms / 1000;
    const p = pitch.position();
    poseSwing(batter, 0, p);
    const barrel = batter.bat!.localToWorld(new THREE.Vector3(0, 1.1, 0));
    expect(barrel.distanceTo(new THREE.Vector3(p.x, p.y, p.z))).toBeLessThan(
      1e-6,
    );
  },
);

it("keeps every generous perfect contact ahead of the plate and the approach continuous", () => {
  const pitch = new Pitching();
  pitch.start(true);
  let previousZ = Infinity;
  for (let ms = 0; ms <= 1810; ms++) {
    pitch.elapsed = ms / 1000;
    const z = pitch.position().z;
    expect(z).toBeLessThan(previousZ);
    previousZ = z;
    if (Math.abs(pitch.error) <= 0.2) {
      expect(z).toBeGreaterThan(0.75 / Math.sqrt(2));
      expect(z).toBeLessThan(1.81);
    }
  }
  pitch.elapsed = 0;
  expect(pitch.position().z).toBeCloseTo(18);
  pitch.elapsed = pitch.contactTime - 0.360001;
  const before = pitch.position().z;
  pitch.elapsed += 0.000002;
  expect(before - pitch.position().z).toBeCloseTo(0.000004, 8);
});

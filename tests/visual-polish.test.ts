import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { VisualPolish } from "../src/visual-polish";
import type { TargetModel } from "../src/models";
import type { TargetId } from "../src/types";

let coarse = false;
let uiRects: {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}[] = [];
const pointerHandlers = new Map<
  string,
  (event: Partial<PointerEvent>) => void
>();
beforeEach(() => {
  coarse = false;
  uiRects = [];
  pointerHandlers.clear();
  vi.stubGlobal("innerWidth", 1440);
  vi.stubGlobal("innerHeight", 900);
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: !coarse }),
    addEventListener: vi.fn(),
  });
  const ink = {
    beginPath() {},
    roundRect() {},
    fill() {},
    fillRect() {},
    fillText() {},
  };
  vi.stubGlobal("document", {
    createElement: () => ({ width: 0, height: 0, getContext: () => ink }),
    querySelectorAll: () =>
      uiRects.map((rect) => ({
        classList: { contains: () => false },
        getBoundingClientRect: () => rect,
      })),
  });
});
afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(57, 1440 / 900, 0.1, 500);
  camera.position.set(0, 10, -20);
  camera.lookAt(0, 4, 65);
  const targets = new Map<TargetId, TargetModel>();
  for (const [id, x] of [
    ["goal", 0],
    ["icecream", 22],
  ] as const) {
    const group = new THREE.Group();
    group.position.set(x, 4, 65);
    const moving = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(6, 6, 4),
      new THREE.MeshStandardMaterial(),
    );
    moving.add(mesh);
    group.add(moving, new THREE.Sprite(new THREE.SpriteMaterial()));
    scene.add(group);
    targets.set(id, {
      group,
      moving,
      extras: [],
      surfaces: [mesh],
      reaction: 0,
      damaged: false,
      hit: false,
      restPosition: moving.position.clone(),
    } as TargetModel);
  }
  const protectedObjects: THREE.Object3D[] = [];
  const canvas = {
    addEventListener: (
      name: string,
      handler: (event: Partial<PointerEvent>) => void,
    ) => pointerHandlers.set(name, handler),
  } as unknown as HTMLCanvasElement;
  const polish = new VisualPolish(targets, scene, canvas, protectedObjects);
  const step = (aim = 0, seconds = 0.8) => {
    for (let time = 0; time < seconds; time += 1 / 60)
      polish.update(1 / 60, camera, false, null, aim, false, false);
    return polish.snapshot().labels.filter((label) => label.visible);
  };
  return { scene, camera, targets, polish, step, protectedObjects };
}
const icecreamAim = Math.atan2(22, 65) / 0.68;

describe("focused target label safety", () => {
  it("starts hidden and fades between aimed targets with only one visible label", () => {
    const { polish, step } = fixture();
    expect(polish.labels.every(({ sprite }) => !sprite.visible)).toBe(true);
    const first = step();
    expect(first.map((label) => label.id)).toEqual(["goal"]);
    const transition = step(icecreamAim, 0.05);
    expect(transition.map((label) => label.id)).toEqual(["goal"]);
    expect(transition[0].opacity).toBeGreaterThan(0.025);
    expect(transition[0].opacity).toBeLessThan(first[0].opacity);
    expect(step(icecreamAim).map((label) => label.id)).toEqual(["icecream"]);
  });

  it("hides significantly obstructed targets and recovers when the obstruction leaves", () => {
    const { scene, step } = fixture();
    expect(step()).toHaveLength(1);
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(90, 40, 2),
      new THREE.MeshStandardMaterial(),
    );
    wall.position.set(0, 8, 25);
    scene.add(wall);
    expect(step()).toHaveLength(0);
    wall.visible = false;
    expect(step().map((label) => label.id)).toEqual(["goal"]);
  });

  it("hides labels outside the view or behind the camera", () => {
    const { targets, step, camera } = fixture();
    expect(step()).toHaveLength(1);
    targets.get("goal")!.group.position.x = 600;
    targets.get("icecream")!.group.position.x = 650;
    expect(step()).toHaveLength(0);
    targets.get("goal")!.group.position.set(0, 4, -80);
    expect(step()).toHaveLength(0);
    camera.lookAt(0, 4, -80);
    expect(step()).toHaveLength(0); // Aim still points into the outfield.
  });

  it("protects live HUD bounds and gameplay subjects, including during fades", () => {
    const { scene, camera, protectedObjects, step } = fixture();
    const first = step()[0].bounds!;
    const cover = new THREE.Mesh(
      new THREE.BoxGeometry(24, 12, 1),
      new THREE.MeshStandardMaterial(),
    );
    cover.position
      .set(
        (first.left + first.right) / 1440 - 1,
        1 - (first.top + first.bottom) / 900,
        0.994,
      )
      .unproject(camera);
    scene.add(cover);
    protectedObjects.push(cover);
    expect(step()).toHaveLength(0);
    cover.visible = false;
    expect(step()).toHaveLength(1);
    uiRects.push({
      left: 0,
      right: 1440,
      top: 0,
      bottom: 900,
      width: 1440,
      height: 900,
    });
    expect(step()).toHaveLength(0);
  });

  it("uses hover on desktop and aim on touch, and remains readable after resizing", () => {
    const desktop = fixture();
    desktop.step();
    const screen = desktop.targets
      .get("icecream")!
      .group.position.clone()
      .project(desktop.camera);
    pointerHandlers.get("pointermove")!({
      pointerType: "mouse",
      clientX: (screen.x + 1) * 720,
      clientY: (1 - screen.y) * 450,
    });
    expect(desktop.step().map((label) => label.id)).toEqual(["icecream"]);
    coarse = true;
    const touch = fixture();
    pointerHandlers.get("pointermove")!({
      pointerType: "mouse",
      clientX: (screen.x + 1) * 720,
      clientY: (1 - screen.y) * 450,
    });
    expect(touch.step().map((label) => label.id)).toEqual(["goal"]);
    expect(touch.step(icecreamAim).map((label) => label.id)).toEqual(["icecream"]);
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 844);
    touch.camera.aspect = 390 / 844;
    touch.camera.updateProjectionMatrix();
    const resized = touch.step()[0].bounds!;
    expect(resized.left).toBeGreaterThan(8);
    expect(resized.right).toBeLessThan(382);
    expect(resized.right - resized.left).toBeGreaterThanOrEqual(148);
  });
});

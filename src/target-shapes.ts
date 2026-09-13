import * as THREE from "three";
import type { TargetId, Vec3 } from "./types";
import { TARGETS } from "./types";

export interface TargetPart {
  kind: "box" | "ellipsoid" | "bowl" | "water";
  position: Vec3;
  size: Vec3;
  color: string;
}
const part = (
  kind: TargetPart["kind"],
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  color: string,
): TargetPart => ({
  kind,
  position: { x, y, z },
  size: { x: sx, y: sy, z: sz },
  color,
});
// One geometry definition drives both visible meshes and collision surfaces.
// Sizes are half extents / radii, relative to Target.position.
export const TARGET_PARTS: Partial<Record<TargetId, TargetPart[]>> = {
  scoreboard: [
    part(
      "box",
      0,
      0,
      0,
      TARGETS.find((t) => t.id === "scoreboard")!.half.x,
      7,
      1,
      "#164451",
    ),
  ],
  lights: [
    part("box", 0, 0, 0, 6, 3, 0.7, "#325365"),
    part(
      "box",
      0,
      -TARGETS.find((t) => t.id === "lights")!.position.y / 2,
      0,
      0.45,
      TARGETS.find((t) => t.id === "lights")!.position.y / 2,
      0.45,
      "#547b89",
    ),
    ...Array.from({ length: 10 }, (_, i) =>
      part(
        "box",
        -4.5 + (i % 5) * 2.25,
        -1.2 + Math.floor(i / 5) * 2.4,
        -0.85,
        0.8,
        0.7,
        0.2,
        "#fff8d3",
      ),
    ),
  ],
  baseball: [part("ellipsoid", 0, 0, 0, 6, 6, 6, "#fff0dd")],
  mascot: [
    part("ellipsoid", 0, -2, 0, 4.5, 6, 3.6, "#8e9eff"),
    part("ellipsoid", 0, 5, -0.3, 4.3, 3.4, 3.5, "#a2b4ff"),
    part("ellipsoid", -5, -0.7, 0, 2, 3, 2, "#8e9eff"),
    part("ellipsoid", 5, -0.7, 0, 2, 3, 2, "#8e9eff"),
  ],
  sock: [
    part("ellipsoid", 2, 1, 0, 2.7, 5.3, 2.5, "#fff9ef"),
    part("ellipsoid", -1.2, -3.4, 0, 5.7, 2.6, 2.5, "#fff9ef"),
    part("ellipsoid", 2, 5.5, 0, 2.85, 1.3, 2.65, "#f58192"),
  ],
  toilet: [
    part("bowl", 0, 0, -1, 1, 1, 1.12, "#fff9ef"),
    part("water", 0, 0.5, -1, 4.05, 0.06, 4.3, "#65d6f0"),
  ],
};
export function targetGeometry(p: TargetPart): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  if (p.kind === "box") g = new THREE.BoxGeometry(2, 2, 2);
  else if (p.kind === "ellipsoid") g = new THREE.SphereGeometry(1, 24, 16);
  else if (p.kind === "water") g = new THREE.CylinderGeometry(1, 1, 2, 40);
  else
    g = new THREE.LatheGeometry(
      [
        [1.5, -2.5],
        [2.8, -2],
        [4, -0.9],
        [4.8, 0.7],
        [4.75, 0.9],
        [4.3, 0.9],
        [3.9, 0.1],
        [2.7, -1.2],
        [0.65, -2.2],
        [1.5, -2.5],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      40,
    );
  g.scale(p.size.x, p.size.y, p.size.z);
  g.translate(p.position.x, p.position.y, p.position.z);
  return g;
}
export const TARGET_REACTION_SECONDS = 2.1;

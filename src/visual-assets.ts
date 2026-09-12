import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Character, TargetModel } from "./models";
import { TARGETS, type TargetId } from "./types";

export const MODEL_NAMES = [
  "field",
  "stadium",
  "batter",
  "bat",
  "baseball",
  "home-plate",
] as const;
export const TARGET_MODEL_NAMES = TARGETS.map((target) => target.id);
export type TargetAssetKey = `target-${TargetId}`;
export type VisualAssets = Partial<
  Record<(typeof MODEL_NAMES)[number] | TargetAssetKey, THREE.Group>
>;

/** Local, self-contained GLBs only. Finish loading before revealing the scene.
 * An unavailable model keeps its procedural equivalent for the whole session.
 */
export async function loadVisualAssets(): Promise<VisualAssets> {
  const loader = new GLTFLoader();
  const files = [
    ...MODEL_NAMES.map((name) => ({ key: name, path: `models/${name}` })),
    ...TARGET_MODEL_NAMES.map((name) => ({
      key: `target-${name}` as TargetAssetKey,
      path: `targets/${name}`,
    })),
  ];
  const entries = await Promise.all(
    files.map(async ({ key: name, path }) => {
      try {
        const response = await fetch(
          `${import.meta.env.BASE_URL}assets/${path}.glb`,
          {
            signal: AbortSignal.timeout(15000),
          },
        );
        if (!response.ok) return [name, undefined] as const;
        const gltf = await loader.parseAsync(await response.arrayBuffer(), "");
        gltf.scene.name = `blender-${name}`;
        gltf.scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.castShadow = name !== "field" && name !== "home-plate";
            object.receiveShadow = true;
          }
        });
        return [name, gltf.scene] as const;
      } catch {
        return [name, undefined] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

/** Retain the exact transform contract used by poseSwing and the Rapier bat. */
export function upgradeBatter(
  original: Character,
  assets: VisualAssets,
): Character {
  const group = assets.batter;
  const head = group?.getObjectByName("Head") as THREE.Group | undefined;
  const arm = group?.getObjectByName("Arm") as THREE.Group | undefined;
  if (group && head && arm) {
    group.position.copy(original.group.position);
    group.quaternion.copy(original.group.quaternion);
    group.scale.copy(original.group.scale);
    original.group.parent!.add(group);
    original.group.removeFromParent();
    // Reuse the original bat pivot, including its exact ready pose.
    arm.add(original.bat!);
    original = { group, head, arm, bat: original.bat };
  }
  if (assets.bat && original.bat) {
    original.bat.clear();
    original.bat.add(assets.bat);
  }
  return original;
}

/** Replace render surfaces only. The old surface objects and all Rapier shapes
 * remain intact. Attach to the existing animation parents; effects and labels
 * retain their original references. Validate the full contract before hiding
 * anything, so a missing, corrupt or incompatible GLB is an atomic fallback.
 */
export function upgradeStadiumTargets(
  targets: Map<TargetId, TargetModel>,
  assets: VisualAssets,
) {
  for (const [id, target] of targets) {
    const asset = assets[`target-${id}`];
    if (!asset) continue;
    const roles = new Map<string, THREE.Object3D>();
    asset.traverse((node) => {
      if (node.userData.targetRole) roles.set(node.userData.targetRole, node);
    });
    const statics = roles.get("Static");
    const moving = roles.get("Moving");
    const tether = roles.get("Tether");
    const inflatable = ["baseball", "hotdog", "mascot"].includes(id);
    const head = roles.get("Head"),
      jaw = roles.get("Jaw");
    const lamps = Array.from({ length: 12 }, (_, i) => roles.get(`Light${i}`));
    if (!statics || (id === "dinosaur" ? !head || !jaw : !moving)) continue;
    if (id === "ufo" && lamps.some((lamp) => !lamp)) continue;
    if (inflatable && !tether) continue;
    // GLTFLoader sanitizes names; semantic extras survive Blender export intact.
    const materialMesh = (finish: string) =>
      moving?.children.find(
        (node) =>
          node instanceof THREE.Mesh && node.userData.surfaceFinish === finish,
      ) as
        | THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
        | undefined;
    const frame = id === "scoreboard" ? materialMesh("metal") : undefined;
    const lenses = id === "lights" ? materialMesh("lens") : undefined;
    if (id === "scoreboard" && !frame?.isMesh) continue;
    if (id === "lights" && !lenses?.isMesh) continue;

    const protectedNodes = new Set<THREE.Object3D>();
    // The transient pizza/flush effects retain their exact original references.
    if (id === "pizza" || id === "toilet")
      for (const extra of target.extras)
        extra.traverse((node) => protectedNodes.add(node));
    target.group.traverse((node) => {
      if (protectedNodes.has(node) || node instanceof THREE.Sprite) return;
      if (node instanceof THREE.Mesh || node instanceof THREE.Line) {
        // Keep the existing transparent UFO beam and its material untouched.
        if (
          id === "ufo" &&
          node instanceof THREE.Mesh &&
          node.material instanceof THREE.MeshBasicMaterial &&
          node.material.transparent
        )
          return;
        node.visible = false;
        node.userData.collisionProxyVisual = true;
      }
    });
    target.group.add(statics);
    if (inflatable) {
      target.group.add(tether!);
      target.extras = [tether!];
    }
    if (id === "dinosaur") {
      target.group.add(head!);
      target.moving = head!;
      target.extras = [jaw!];
      target.restPosition.copy(head!.position);
    } else {
      target.moving.add(moving!);
      if (id === "ufo") target.extras = lamps as THREE.Object3D[];
    }
    if (frame) {
      frame.material = frame.material.clone();
      target.surfaces[0].material = frame.material;
    }
    if (lenses) {
      // The unchanged reaction code drives the actual imported lamp material.
      for (const surface of target.surfaces.slice(2))
        surface.material = lenses.material;
    }
    target.group.userData.targetAsset = id;
  }
}

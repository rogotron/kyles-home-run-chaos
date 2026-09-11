import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Character, TargetModel } from "./models";

export const MODEL_NAMES = [
  "field",
  "stadium",
  "batter",
  "bat",
  "baseball",
  "home-plate",
  "dinosaur",
] as const;
export type VisualAssets = Partial<
  Record<(typeof MODEL_NAMES)[number], THREE.Group>
>;

/** Local, self-contained GLBs only. Finish loading before revealing the scene.
 * An unavailable model keeps its procedural equivalent for the whole session.
 */
export async function loadVisualAssets(): Promise<VisualAssets> {
  const loader = new GLTFLoader();
  const entries = await Promise.all(
    MODEL_NAMES.map(async (name) => {
      try {
        const response = await fetch(
          `${import.meta.env.BASE_URL}assets/models/${name}.glb`,
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

export function upgradeDinosaur(target: TargetModel, asset?: THREE.Group) {
  const body = asset?.getObjectByName("Body");
  const head = asset?.getObjectByName("Head");
  const jaw = asset?.getObjectByName("Jaw");
  if (!body || !head || !jaw) return;
  // Labels stay at their established gameplay anchors. Collider remains in Physics.
  for (const child of [...target.group.children]) {
    if (!(child instanceof THREE.Sprite)) target.group.remove(child);
  }
  target.group.add(body, head);
  target.moving = head;
  target.extras = [jaw];
  target.restPosition.copy(head.position);
}

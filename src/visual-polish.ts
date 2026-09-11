import * as THREE from "three";
import type { TargetModel } from "./models";
import { TARGETS, type TargetId } from "./types";
import { BATTER_STANCE } from "./batter";

type Rect = { left: number; top: number; right: number; bottom: number };
const overlaps = (a: Rect, b: Rect, gap = 8) =>
  a.left < b.right + gap &&
  a.right > b.left - gap &&
  a.top < b.bottom + gap &&
  a.bottom > b.top - gap;

const PLAQUES: Record<TargetId, [string, number, number]> = {
  dinosaur: ["DINO · +4K", 10, 10],
  mascot: ["MASCOT · +2K", 6.5, 11],
  goal: ["GOAL · 3×", 6.5, 10],
  ufo: ["UFO · +3K", -4.5, 10],
  pizza: ["PIZZA · +2K", 7.5, 11],
  toilet: ["FLUSH · +5K", 12.8, 10],
  scoreboard: ["BOARD · +4K", 11, 12],
  lights: ["LIGHTS · +1.5K", 17, 12],
  baseball: ["BASEBALL · +1.5K", 12, 13],
  hotdog: ["HOT DOG · +2.5K", 9, 12],
};

function plaque(text: string, color: string, width: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 96;
  const ink = canvas.getContext("2d")!;
  ink.fillStyle = "#153c48";
  ink.beginPath();
  ink.roundRect(2, 2, 508, 92, 17);
  ink.fill();
  ink.fillStyle = color;
  ink.beginPath();
  ink.roundRect(12, 19, 7, 58, 3);
  ink.fill();
  ink.fillStyle = "#fff7e3";
  ink.font = "800 48px Segoe UI, sans-serif";
  ink.textAlign = "center";
  ink.textBaseline = "middle";
  ink.fillText(text, 265, 50, 465);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  sprite.scale.set(width, 2.05, 1);
  sprite.name = "target-plaque";
  return sprite;
}

/** Render-only composition. Target transforms and hit surfaces never change. */
export class VisualPolish {
  labels: { id: TargetId; target: TargetModel; sprite: THREE.Sprite }[] = [];
  mascotOpacity = 1;
  private mascotMaterials: THREE.Material[] = [];
  private mascotMeshes: { mesh: THREE.Mesh; castShadow: boolean }[] = [];
  private point = new THREE.Vector3();
  private hud: Rect | null = null;
  private layoutKey = "";
  private bounds = new Map<THREE.Sprite, Rect>();

  constructor(targets: Map<TargetId, TargetModel>) {
    for (const [id, target] of targets) {
      const [text, y, width] = PLAQUES[id];
      for (const old of [...target.group.children]) {
        if (!(old instanceof THREE.Sprite)) continue;
        const replacement = plaque(
          old.userData.damagedOnly
            ? id === "hotdog"
              ? "FLAT · NEXT ROUND"
              : "POPPED · NEXT ROUND"
            : text,
          TARGETS.find((t) => t.id === id)!.color,
          width,
        );
        replacement.userData = { ...old.userData };
        replacement.position.set(
          id === "hotdog" ? 2 : 0,
          y,
          id === "ufo" ? 0 : -5.2,
        );
        target.group.add(replacement);
        target.group.remove(old);
        old.material.map?.dispose();
        old.material.dispose();
        this.labels.push({ id, target, sprite: replacement });
      }
    }
    // Give only the occluding mascot its own fade materials. Shared target
    // materials, the mascot's geometry and its Rapier collider stay untouched.
    const clones = new Map<THREE.Material, THREE.Material>();
    targets.get("mascot")!.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      this.mascotMeshes.push({ mesh: object, castShadow: object.castShadow });
      const clone = (source: THREE.Material) => {
        if (!clones.has(source)) {
          const material = source.clone();
          material.transparent = true;
          clones.set(source, material);
        }
        return clones.get(source)!;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(clone)
        : clone(object.material);
    });
    this.mascotMaterials = [...clones.values()];
  }

  update(
    dt: number,
    camera: THREE.PerspectiveCamera,
    menu: boolean,
    reaction?: TargetId | null,
  ) {
    const fade = 1 - Math.exp(-dt * 10);
    this.mascotOpacity = THREE.MathUtils.lerp(
      this.mascotOpacity,
      reaction === "dinosaur" ? 0.08 : 1,
      fade,
    );
    for (const material of this.mascotMaterials) {
      material.opacity = this.mascotOpacity;
      material.depthWrite = this.mascotOpacity > 0.99;
    }
    for (const { mesh, castShadow } of this.mascotMeshes) {
      mesh.castShadow = castShadow && this.mascotOpacity > 0.99;
    }

    const key = `${innerWidth}:${innerHeight}:${menu}`;
    if (key !== this.layoutKey || (!menu && !this.hud)) {
      this.layoutKey = key;
      const rect = document.querySelector("#hud")?.getBoundingClientRect();
      this.hud = !menu && rect?.height ? rect : null;
    }
    camera.updateMatrixWorld();
    const occupied: Rect[] = [];
    for (const { target, sprite } of this.labels) {
      sprite.getWorldPosition(this.point);
      const depth = -this.point.clone().applyMatrix4(camera.matrixWorldInverse)
        .z;
      this.point.project(camera);
      const x = ((this.point.x + 1) * innerWidth) / 2;
      const y = ((1 - this.point.y) * innerHeight) / 2;
      const factor =
        (innerHeight * camera.projectionMatrix.elements[5]) / (2 * depth);
      const width = sprite.scale.x * factor;
      const height = sprite.scale.y * factor;
      const rect = {
        left: x - width / 2,
        right: x + width / 2,
        top: y - height / 2,
        bottom: y + height / 2,
      };
      this.bounds.set(sprite, rect);
      const eligible =
        !reaction &&
        depth > 0 &&
        this.point.z < 1 &&
        (!sprite.userData.intactOnly || !target.damaged) &&
        (!sprite.userData.damagedOnly || target.damaged);
      const clear =
        eligible &&
        rect.top > (innerWidth < 600 ? 80 : 96) &&
        rect.bottom < innerHeight - 30 &&
        rect.left > 8 &&
        rect.right < innerWidth - 8 &&
        (!this.hud || !overlaps(rect, this.hud)) &&
        !occupied.some((other) => overlaps(rect, other));
      sprite.material.opacity = THREE.MathUtils.lerp(
        sprite.material.opacity,
        clear ? 0.94 : 0,
        fade,
      );
      // Hard exclusions prevent a fading label from covering the HUD or a result.
      sprite.visible =
        eligible &&
        rect.top > (innerWidth < 600 ? 80 : 96) &&
        rect.left > 8 &&
        rect.right < innerWidth - 8 &&
        (!this.hud || !overlaps(rect, this.hud)) &&
        sprite.material.opacity > 0.025;
      if (clear) occupied.push(rect);
    }
  }

  snapshot() {
    return {
      mascotOpacity: this.mascotOpacity,
      labels: this.labels.map(({ id, sprite }) => ({
        id,
        visible: sprite.visible,
        opacity: sprite.material.opacity,
        bounds: this.bounds.get(sprite),
      })),
    };
  }
}

/** Small baked-style grounding decals supplement the broad stadium shadow map.
 * One shared 64px procedural alpha texture; no extra shadow cameras or physics.
 */
export function addContactShadows(scene: THREE.Scene) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ink = canvas.getContext("2d")!;
  const gradient = ink.createRadialGradient(32, 32, 1, 32, 32, 31);
  gradient.addColorStop(0, "rgba(255,255,255,0.7)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.42)");
  gradient.addColorStop(0.72, "rgba(255,255,255,0.12)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ink.fillStyle = gradient;
  ink.fillRect(0, 0, 64, 64);
  const material = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(canvas),
    color: "#294c43",
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const geometry = new THREE.PlaneGeometry(1, 1);
  const shadow = (
    x: number,
    y: number,
    z: number,
    width: number,
    length: number,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "soft-contact-shadow";
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.scale.set(width, length, 1);
    scene.add(mesh);
  };
  for (const foot of [-1, 1]) {
    shadow(
      BATTER_STANCE.x + 0.09,
      0.061,
      foot * 0.22 * BATTER_STANCE.scale,
      0.82,
      0.59,
    );
    shadow(foot * 0.27 * 1.12, 0.285, 17.9, 0.6, 0.82);
    shadow(34 + foot * 3, -0.114, 83.1, 4.6, 5.2);
  }
  for (const [x, z] of [
    [0, 0],
    [-12.7, 12.7],
    [0, 25.4],
    [12.7, 12.7],
  ]) {
    shadow(x, x === 0 && z === 0 ? 0.061 : 0.041, z, 1.2, 1.2);
  }
  for (let i = 0; i < 13; i++) {
    const angle = -1.22 + (i * 2.44) / 12;
    for (const side of [-6.5, 6.5]) {
      shadow(
        125 * Math.sin(angle) + side * Math.cos(angle),
        -0.114,
        125 * Math.cos(angle) - side * Math.sin(angle),
        2.6,
        2.6,
      );
    }
  }
}

import * as THREE from "three";
import type { TargetModel } from "./models";
import { TARGETS, type TargetId } from "./types";
import { BATTER_STANCE } from "./batter";
import stadiumLayout from "./stadium-layout.json";

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
      depthTest: false,
      depthWrite: false,
    }),
  );
  sprite.scale.set(width, 2.05, 1);
  sprite.name = "target-plaque";
  sprite.renderOrder = 30;
  return sprite;
}

/** Render-only composition. Target transforms and hit surfaces never change. */
export class VisualPolish {
  labels: { id: TargetId; target: TargetModel; sprite: THREE.Sprite }[] = [];
  mascotOpacity = 1;
  private point = new THREE.Vector3();
  private hud: Rect | null = null;
  private layoutKey = "";
  private bounds = new Map<THREE.Sprite, Rect>();
  private anchors = new Map<THREE.Sprite, THREE.Vector3>();
  private subjects = new Map<
    TargetId,
    { target: TargetModel; box: THREE.Box3 }
  >();
  private scenery: THREE.Box3[] = [];
  private obstacles: Rect[] = [];

  private projectBox(
    box: THREE.Box3,
    camera: THREE.Camera,
    matrix?: THREE.Matrix4,
  ): Rect | null {
    const rect = {
      left: Infinity,
      right: -Infinity,
      top: Infinity,
      bottom: -Infinity,
    };
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const p = new THREE.Vector3(x, y, z);
          if (matrix) p.applyMatrix4(matrix);
          if (p.clone().applyMatrix4(camera.matrixWorldInverse).z >= -0.1)
            return null;
          p.project(camera);
          const sx = ((p.x + 1) * innerWidth) / 2,
            sy = ((1 - p.y) * innerHeight) / 2;
          rect.left = Math.min(rect.left, sx);
          rect.right = Math.max(rect.right, sx);
          rect.top = Math.min(rect.top, sy);
          rect.bottom = Math.max(rect.bottom, sy);
        }
    return rect;
  }

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
        this.anchors.set(replacement, replacement.position.clone());
      }
      // Cache actual render bounds, excluding labels, tethers and supports when
      // the floating target itself is the subject. Rapier geometry is untouched.
      target.group.updateWorldMatrix(true, true);
      const inverse = target.group.matrixWorld.clone().invert();
      const bounds = new THREE.Box3();
      const subject = ["scoreboard", "baseball", "mascot", "hotdog"].includes(
        id,
      )
        ? target.moving
        : target.group;
      subject.traverseVisible((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.computeBoundingBox();
        const local = inverse.clone().multiply(object.matrixWorld);
        bounds.union(object.geometry.boundingBox!.clone().applyMatrix4(local));
      });
      if (id === "lights") bounds.min.y = 20;
      this.subjects.set(id, { target, box: bounds });
    }
    for (const side of [-1, 1]) {
      const x = (side * stadiumLayout.wallRadius) / Math.sqrt(2);
      const z = stadiumLayout.wallRadius / Math.sqrt(2);
      this.scenery.push(
        new THREE.Box3(
          new THREE.Vector3(x - 1, 0, z - 0.2),
          new THREE.Vector3(x + 1, stadiumLayout.poleHeight, z + 0.2),
        ),
      );
    }
    for (const [x, z] of stadiumLayout.floodlights)
      this.scenery.push(
        new THREE.Box3(
          new THREE.Vector3(x - 5.2, 0, z - 0.7),
          new THREE.Vector3(x + 5.2, 39, z + 0.7),
        ),
      );
    for (let i = 0; i < 13; i++) {
      const angle = -1.22 + (i * 2.44) / 12;
      const matrix = new THREE.Matrix4().makeRotationY(angle);
      matrix.setPosition(
        stadiumLayout.canopyRadius * Math.sin(angle),
        0,
        stadiumLayout.canopyRadius * Math.cos(angle),
      );
      this.scenery.push(
        new THREE.Box3(
          new THREE.Vector3(-8, 14.4, -6),
          new THREE.Vector3(8, 19, 5),
        ).applyMatrix4(matrix),
      );
    }
    // The mascot now has its own space. Keep it opaque, so seating and other
    // scenery cannot show through it during the dinosaur reaction.
  }

  update(
    dt: number,
    camera: THREE.PerspectiveCamera,
    menu: boolean,
    reaction?: TargetId | null,
  ) {
    const fade = 1 - Math.exp(-dt * 10);

    const key = `${innerWidth}:${innerHeight}:${menu}`;
    if (key !== this.layoutKey || (!menu && !this.hud)) {
      this.layoutKey = key;
      const rect = document.querySelector("#hud")?.getBoundingClientRect();
      this.hud = !menu && rect?.height ? rect : null;
    }
    camera.updateMatrixWorld();
    const subjectRects = new Map<TargetId, Rect>();
    for (const [id, { target, box }] of this.subjects) {
      target.group.updateWorldMatrix(true, false);
      const r = this.projectBox(box, camera, target.group.matrixWorld);
      if (r) subjectRects.set(id, r);
    }
    this.obstacles = [
      ...subjectRects.values(),
      ...this.scenery
        .map((box) => this.projectBox(box, camera))
        .filter((r): r is Rect => !!r),
    ];
    const occupied: Rect[] = [];
    for (const { id, target, sprite } of this.labels) {
      this.point.copy(this.anchors.get(sprite)!);
      target.group.localToWorld(this.point);
      const depth = -this.point.clone().applyMatrix4(camera.matrixWorldInverse)
        .z;
      this.point.project(camera);
      const x = ((this.point.x + 1) * innerWidth) / 2;
      const y = ((1 - this.point.y) * innerHeight) / 2;
      const factor =
        (innerHeight * camera.projectionMatrix.elements[5]) / (2 * depth);
      const width = THREE.MathUtils.clamp(PLAQUES[id][2] * factor, 88, 132);
      const height = (width * 96) / 512;
      const at = (cx: number, cy: number): Rect => ({
        left: cx - width / 2,
        right: cx + width / 2,
        top: cy - height / 2,
        bottom: cy + height / 2,
      });
      const eligible =
        !reaction &&
        depth > 0 &&
        this.point.z < 1 &&
        (!sprite.userData.intactOnly || !target.damaged) &&
        (!sprite.userData.damagedOnly || target.damaged);
      const fits = (rect: Rect) =>
        rect.top > (innerWidth < 600 ? 80 : 96) &&
        rect.bottom < innerHeight - 30 &&
        rect.left > 8 &&
        rect.right < innerWidth - 8 &&
        (!this.hud || !overlaps(rect, this.hud)) &&
        !occupied.some((other) => overlaps(rect, other)) &&
        !this.obstacles.some((other) => overlaps(rect, other, 4));
      const subject = subjectRects.get(id);
      const candidates = [at(x, y)];
      if (subject) {
        const cx = (subject.left + subject.right) / 2;
        const cy = (subject.top + subject.bottom) / 2;
        for (const gap of [7, 23, 39, 55, 71])
          for (const offset of [0, -width * 0.45, width * 0.45]) {
            candidates.push(at(cx + offset, subject.bottom + height / 2 + gap));
            candidates.push(at(cx + offset, subject.top - height / 2 - gap));
          }
        candidates.push(
          at(subject.right + width / 2 + 7, cy),
          at(subject.left - width / 2 - 7, cy),
        );
      }
      const rect = candidates.find(fits) ?? candidates[0];
      const clear = eligible && fits(rect);
      this.bounds.set(sprite, rect);
      if (clear) {
        const cx = (rect.left + rect.right) / 2,
          cy = (rect.top + rect.bottom) / 2;
        const world = new THREE.Vector3(
          (cx / innerWidth) * 2 - 1,
          1 - (cy / innerHeight) * 2,
          this.point.z,
        ).unproject(camera);
        sprite.position.copy(target.group.worldToLocal(world));
        sprite.scale.set(width / factor, height / factor, 1);
      }
      sprite.material.opacity = THREE.MathUtils.lerp(
        sprite.material.opacity,
        clear ? 0.94 : 0,
        fade,
      );
      // Hard exclusions prevent a fading label from covering the HUD or a result.
      sprite.visible = clear && sprite.material.opacity > 0.025;
      if (clear) occupied.push(rect);
    }
  }

  snapshot() {
    return {
      mascotOpacity: this.mascotOpacity,
      obstacles: this.obstacles,
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
        stadiumLayout.canopyRadius * Math.sin(angle) + side * Math.cos(angle),
        -0.114,
        stadiumLayout.canopyRadius * Math.cos(angle) - side * Math.sin(angle),
        2.6,
        2.6,
      );
    }
  }
}

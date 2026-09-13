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

function plaque(text: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 128;
  const ink = canvas.getContext("2d")!;
  ink.fillStyle = "#153c48";
  ink.beginPath();
  ink.roundRect(2, 2, 764, 124, 22);
  ink.fill();
  ink.fillStyle = color;
  ink.fillRect(16, 26, 8, 76);
  ink.fillStyle = "#fff7e3";
  ink.font = "800 58px Segoe UI, sans-serif";
  ink.textAlign = "center";
  ink.textBaseline = "middle";
  ink.fillText(text, 394, 66, 712);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    }),
  );
  sprite.name = "target-plaque";
  sprite.renderOrder = 30;
  sprite.visible = false;
  return sprite;
}

/** Focus and layout are render-only: read the existing aim, never steer a shot. */
export class VisualPolish {
  labels: { id: TargetId; target: TargetModel; sprite: THREE.Sprite }[] = [];
  mascotOpacity = 1;
  private bounds = new Map<THREE.Sprite, Rect>();
  private subjects = new Map<
    TargetId,
    { target: TargetModel; meshes: THREE.Mesh[]; box: THREE.Box3 }
  >();
  private obstacles: Rect[] = [];
  private ray = new THREE.Raycaster();
  private point = new THREE.Vector3();
  private box = new THREE.Box3();
  private focused: THREE.Sprite | null = null;
  private pointer: THREE.Vector2 | null = null;
  private hoverMedia = window.matchMedia("(hover: hover) and (pointer: fine)");
  private uiElements: HTMLElement[] = [];
  private occlusionAge = 1;
  private occlusionId: TargetId | null = null;
  private occluded = false;

  constructor(
    targets: Map<TargetId, TargetModel>,
    private scene: THREE.Scene,
    canvas: HTMLCanvasElement,
    private protectedObjects: THREE.Object3D[],
  ) {
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerType !== "mouse" || !this.hoverMedia.matches) return;
        this.pointer = new THREE.Vector2(event.clientX, event.clientY);
      },
      { passive: true },
    );
    canvas.addEventListener("pointerleave", () => {
      this.pointer = null;
    });
    window.addEventListener("blur", () => {
      this.pointer = null;
    });
    // Keyboard aiming supersedes the last mouse position, without handling input.
    window.addEventListener("keydown", (event) => {
      if (["ArrowLeft", "ArrowRight", "a", "d", "A", "D"].includes(event.key))
        this.pointer = null;
    });
    for (const [id, target] of targets) {
      const info = TARGETS.find((t) => t.id === id)!;
      for (const old of [...target.group.children]) {
        if (!(old instanceof THREE.Sprite)) continue;
        const suffix = old.userData.damagedOnly ? " · DOWN" : "";
        const replacement = plaque(
          info.name.toUpperCase() + suffix,
          info.color,
        );
        replacement.userData = { ...old.userData };
        target.group.add(replacement);
        old.removeFromParent();
        old.material.map?.dispose();
        old.material.dispose();
        this.labels.push({ id, target, sprite: replacement });
      }
      const meshes: THREE.Mesh[] = [];
      const subject = [
        "scoreboard",
        "baseball",
        "mascot",
        "sock",
        "ufo",
      ].includes(id)
        ? target.moving
        : target.group;
      subject.traverseVisible((object) => {
        if (
          !(object instanceof THREE.Mesh) ||
          object.userData.collisionProxyVisual
        )
          return;
        object.geometry.computeBoundingBox();
        meshes.push(object);
      });
      this.subjects.set(id, { target, meshes, box: new THREE.Box3() });
    }
  }

  private projectBox(box: THREE.Box3, camera: THREE.Camera): Rect | null {
    if (box.isEmpty()) return null;
    const rect = {
      left: Infinity,
      right: -Infinity,
      top: Infinity,
      bottom: -Infinity,
    };
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          this.point.set(x, y, z);
          if (
            this.point.clone().applyMatrix4(camera.matrixWorldInverse).z >= -0.1
          )
            return null;
          this.point.project(camera);
          const sx = ((this.point.x + 1) * innerWidth) / 2;
          const sy = ((1 - this.point.y) * innerHeight) / 2;
          rect.left = Math.min(rect.left, sx);
          rect.right = Math.max(rect.right, sx);
          rect.top = Math.min(rect.top, sy);
          rect.bottom = Math.max(rect.bottom, sy);
        }
    return rect;
  }

  /** Three sightlines to the target surface; ignore transparent beams and effects.
   * Throttled to 8 Hz and only for the chosen target, not the entire catalogue. */
  private obstructed(id: TargetId, camera: THREE.Camera) {
    const { target, box } = this.subjects.get(id)!;
    const occluders: THREE.Object3D[] = [];
    this.scene.traverseVisible((node) => {
      if (
        !(node instanceof THREE.Mesh) ||
        node instanceof THREE.InstancedMesh ||
        node.userData.dynamicCrowd ||
        node.userData.collisionProxyVisual
      )
        return;
      for (
        let parent: THREE.Object3D | null = node;
        parent;
        parent = parent.parent
      )
        if (parent === target.group) return;
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];
      if (materials.every((m) => m.transparent || !m.depthTest)) return;
      occluders.push(node);
    });
    let blocked = 0;
    for (const side of [-0.25, 0, 0.25]) {
      const sample = box.getCenter(new THREE.Vector3());
      sample.x += (box.max.x - box.min.x) * side;
      sample.y += (box.max.y - box.min.y) * 0.18;
      const direction = sample.clone().sub(camera.position).normalize();
      this.ray.set(camera.position, direction);
      // Stop at the subject's near face, avoiding scenery behind hollow targets.
      const near = this.ray.ray.intersectBox(box, new THREE.Vector3());
      this.ray.far = near
        ? camera.position.distanceTo(near) - 0.15
        : camera.position.distanceTo(sample);
      if (this.ray.intersectObjects(occluders, false).length) blocked++;
    }
    return blocked >= 2;
  }

  update(
    dt: number,
    camera: THREE.PerspectiveCamera,
    menu: boolean,
    reaction: TargetId | null | undefined,
    aim: number,
    flight: boolean,
    paused: boolean,
  ) {
    camera.updateMatrixWorld();
    this.scene.updateMatrixWorld(true);
    const subjectRects = new Map<TargetId, Rect>();
    for (const [id, subject] of this.subjects) {
      subject.box.makeEmpty();
      for (const mesh of subject.meshes) {
        if (!mesh.visible) continue;
        subject.box.union(
          this.box
            .copy(mesh.geometry.boundingBox!)
            .applyMatrix4(mesh.matrixWorld),
        );
      }
      const rect = this.projectBox(subject.box, camera);
      if (rect) subjectRects.set(id, rect);
    }
    // Read current visible UI bounds, including transient results and touch controls.
    if (!this.uiElements.length)
      this.uiElements = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".topbar, #hud, #menu, #targets, .bottom-bar, #touch-controls, #announcement, #timing-debug, .modal, .pitch-hint, .hit-result, .flight, .golden-banner",
        ),
      );
    const uiRects = this.uiElements
      .filter((el) => !el.classList.contains("hidden"))
      .map((el) => el.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    const protectedRects: Rect[] = [];
    for (const object of this.protectedObjects) {
      if (!object.visible) continue;
      const rect = this.projectBox(this.box.setFromObject(object), camera);
      if (rect) protectedRects.push(rect);
    }
    this.obstacles = [...subjectRects.values(), ...protectedRects, ...uiRects];
    const available = this.labels.filter(({ id, target, sprite }) => {
      const rect = subjectRects.get(id);
      if (
        !rect ||
        rect.right < 0 ||
        rect.left > innerWidth ||
        rect.bottom < 0 ||
        rect.top > innerHeight
      )
        return false;
      const center = this.subjects
        .get(id)!
        .box.getCenter(new THREE.Vector3())
        .project(camera);
      return (
        Math.abs(center.x) < 1 &&
        Math.abs(center.y) < 1 &&
        center.z > -1 &&
        center.z < 1 &&
        (!sprite.userData.intactOnly || !target.damaged) &&
        (!sprite.userData.damagedOnly || target.damaged)
      );
    });
    let best: (typeof this.labels)[number] | undefined;
    let bestScore = Infinity;
    for (const item of available) {
      const rect = subjectRects.get(item.id)!;
      const center = this.subjects
        .get(item.id)!
        .box.getCenter(new THREE.Vector3());
      const screen = center.clone().project(camera);
      const hovering =
        this.pointer &&
        this.hoverMedia.matches &&
        this.pointer.x >= rect.left &&
        this.pointer.x <= rect.right &&
        this.pointer.y >= rect.top &&
        this.pointer.y <= rect.bottom &&
        !uiRects.some(
          (r) =>
            this.pointer!.x >= r.left &&
            this.pointer!.x <= r.right &&
            this.pointer!.y >= r.top &&
            this.pointer!.y <= r.bottom,
        );
      const angle = Math.abs(Math.atan2(center.x, center.z) - aim * 0.68);
      const score = hovering
        ? -2 + camera.position.distanceTo(center) / 10000
        : menu || flight
          ? Math.hypot(screen.x, screen.y)
          : angle;
      const threshold = menu || flight ? 0.65 : 0.24;
      // Hysteresis prevents flicker between neighboring targets as aim drifts.
      const stableScore = score - (this.focused === item.sprite ? 0.025 : 0);
      if ((hovering || score < threshold) && stableScore < bestScore) {
        best = item;
        bestScore = stableScore;
      }
    }
    this.occlusionAge += dt;
    if (best && (this.occlusionId !== best.id || this.occlusionAge >= 0.125)) {
      this.occluded = this.obstructed(best.id, camera);
      this.occlusionId = best.id;
      this.occlusionAge = 0;
    }
    const wanted =
      !reaction && !paused && !this.occluded ? (best?.sprite ?? null) : null;
    // Fade out before switching: at most one label, including during transitions.
    if (
      this.focused &&
      this.focused !== wanted &&
      this.focused.material.opacity < 0.025
    )
      this.focused = null;
    if (!this.focused) this.focused = wanted;
    for (const { id, target, sprite } of this.labels) {
      const subject = this.subjects.get(id)!;
      const subjectRect = subjectRects.get(id);
      const anchor = subject.box.getCenter(new THREE.Vector3());
      anchor.y = subject.box.max.y;
      const depth = -anchor.clone().applyMatrix4(camera.matrixWorldInverse).z;
      const factor =
        (innerHeight * camera.projectionMatrix.elements[5]) /
        (2 * Math.max(depth, 0.1));
      const width = THREE.MathUtils.clamp(
        178 * Math.sqrt(95 / Math.max(depth, 1)),
        148,
        196,
      );
      const height = width / 6;
      const fits = (rect: Rect) =>
        rect.top > 8 &&
        rect.bottom < innerHeight - 8 &&
        rect.left > 8 &&
        rect.right < innerWidth - 8 &&
        !this.obstacles.some((obstacle) => overlaps(rect, obstacle, 4));
      const candidates: Rect[] = [];
      if (subjectRect) {
        const cx = (subjectRect.left + subjectRect.right) / 2;
        // Keep the plaque above its object, with only modest collision offsets.
        for (const gap of [10, 26, 42])
          for (const offset of [
            0,
            -width * 0.28,
            width * 0.28,
            -width * 0.7,
            width * 0.7,
          ])
            candidates.push({
              left: cx + offset - width / 2,
              right: cx + offset + width / 2,
              top: subjectRect.top - height - gap,
              bottom: subjectRect.top - gap,
            });
      }
      const rect = candidates.find(fits) ?? candidates[0] ?? null;
      const safe =
        !!rect &&
        depth > 0 &&
        fits(rect) &&
        available.some((item) => item.sprite === sprite) &&
        !reaction &&
        !paused &&
        !(this.occlusionId === id && this.occluded);
      if (rect) this.bounds.set(sprite, rect);
      if (safe && rect) {
        const projected = anchor.project(camera);
        projected.x = ((rect.left + rect.right) / 2 / innerWidth) * 2 - 1;
        projected.y = 1 - ((rect.top + rect.bottom) / 2 / innerHeight) * 2;
        sprite.position.copy(
          target.group.worldToLocal(projected.unproject(camera)),
        );
        const scale = target.group.getWorldScale(new THREE.Vector3());
        sprite.scale.set(
          width / factor / scale.x,
          height / factor / scale.y,
          1,
        );
      }
      const show = safe && sprite === this.focused && sprite === wanted;
      sprite.material.opacity = THREE.MathUtils.lerp(
        sprite.material.opacity,
        show ? 0.96 : 0,
        1 - Math.exp(-dt * 12),
      );
      // Immediate safety exclusions; normal loss of focus keeps its smooth fade.
      sprite.visible =
        safe && sprite === this.focused && sprite.material.opacity > 0.025;
    }
  }

  snapshot() {
    return {
      mascotOpacity: this.mascotOpacity,
      focused:
        this.labels.find(({ sprite }) => sprite === this.focused)?.id ?? null,
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
  // Broad, stable grounding for the colorful outfield toys. These share one
  // material and are merged with the static scene, so they add no shadow pass.
  for (const target of TARGETS) {
    if (target.id === "ufo" || target.id === "dinosaur") continue;
    shadow(
      target.position.x,
      -0.114,
      target.position.z,
      target.half.x * 1.8,
      Math.max(4, target.half.z * 2),
    );
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

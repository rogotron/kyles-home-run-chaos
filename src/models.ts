import * as THREE from "three";
import { TARGET_PARTS, targetGeometry } from "./target-shapes";
import { TARGETS } from "./types";
import type { TargetId } from "./types";
const materials = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, roughness = 0.8) {
  const key = color + roughness;
  if (!materials.has(key))
    materials.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
  return materials.get(key)!;
}
export function box(
  parent: THREE.Object3D,
  color: string,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function sphere(
  parent: THREE.Object3D,
  color: string,
  x: number,
  y: number,
  z: number,
  rx: number,
  ry = rx,
  rz = rx,
) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat(color));
  m.position.set(x, y, z);
  m.scale.set(rx, ry, rz);
  m.castShadow = true;
  parent.add(m);
  return m;
}
export function cylinder(
  parent: THREE.Object3D,
  color: string,
  x: number,
  y: number,
  z: number,
  rt: number,
  rb: number,
  h: number,
  segments = 16,
) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(rt, rb, h, segments),
    mat(color),
  );
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function label(
  text: string,
  sub = "",
  color = "#ffffff",
  width = 12,
  height = 3,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 192;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#102d3a";
  c.beginPath();
  c.roundRect(6, 6, 756, 180, 28);
  c.fill();
  c.strokeStyle = color;
  c.lineWidth = 5;
  c.stroke();
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = color;
  c.font = "900 57px Segoe UI, sans-serif";
  c.fillText(text, 384, sub ? 68 : 98, 714);
  if (sub) {
    c.fillStyle = "#ffffff";
    c.font = "800 31px Segoe UI, sans-serif";
    c.fillText(sub, 384, 133, 714);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthWrite: false }),
  );
  sprite.scale.set(width, height, 1);
  return sprite;
}
export interface Character {
  group: THREE.Group;
  arm: THREE.Group;
  bat?: THREE.Group;
  head: THREE.Group;
}
export function character(parent: THREE.Object3D, pitcher = false): Character {
  const g = new THREE.Group();
  parent.add(g);
  const uniform = pitcher ? "#f56769" : "#198bdd";
  for (const x of pitcher ? [-0.27, 0.27] : [-0.22, 0.22]) {
    cylinder(g, "#f8f0df", x, 0.48, 0, 0.19, 0.17, 0.72);
    const foot = box(g, "#133747", x, 0.13, -0.09, 0.4, 0.23, 0.62);
    foot.name = "foot";
  }
  const body = cylinder(g, uniform, 0, 1.16, 0, 0.42, 0.34, 0.85);
  body.scale.z = 0.82;
  cylinder(g, "#ffb15c", 0, 0.81, 0, 0.35, 0.35, 0.12);
  const head = new THREE.Group();
  head.position.y = 1.93;
  g.add(head);
  sphere(head, "#f4b982", 0, 0, 0, 0.39, 0.43, 0.36);
  sphere(head, "#7c422f", 0, 0.18, 0.11, 0.4, 0.28, 0.3);
  sphere(head, uniform, 0, 0.27, 0, 0.43, 0.23, 0.39);
  box(head, uniform, 0, 0.21, -0.32, 0.61, 0.07, 0.37);
  for (const x of [-0.14, 0.14]) {
    sphere(head, "#172e37", x, 0.02, -0.327, 0.035, 0.05, 0.025);
  }
  const arm = new THREE.Group();
  arm.position.set(0.42, 1.5, 0);
  g.add(arm);
  cylinder(arm, uniform, 0.12, -0.17, 0, 0.16, 0.15, 0.42);
  sphere(arm, "#f4b982", 0.12, -0.42, 0, 0.16);
  const left = cylinder(g, uniform, -0.46, 1.29, 0, 0.15, 0.15, 0.5);
  left.rotation.z = -0.23;
  sphere(
    g,
    pitcher ? "#9a572f" : "#f4b982",
    -0.5,
    1.02,
    -0.05,
    pitcher ? 0.27 : 0.16,
  );
  const number = label(pitcher ? "C" : "7", "", "#ffb64c", 0.4, 0.33);
  number.position.set(0, 1.25, -0.36);
  g.add(number);
  if (!pitcher) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ink = canvas.getContext("2d")!;
    ink.fillStyle = "#ffba50";
    ink.font = "900 110px Segoe UI";
    ink.textAlign = "center";
    ink.textBaseline = "middle";
    ink.fillText("7", 64, 66);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const backNumber = new THREE.Mesh(
      new THREE.PlaneGeometry(0.45, 0.5),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
    );
    backNumber.position.set(0, 1.25, 0.36);
    g.add(backNumber);
  }
  let bat: THREE.Group | undefined;
  if (!pitcher) {
    bat = new THREE.Group();
    bat.position.set(0.14, -0.37, 0);
    arm.add(bat);
    cylinder(bat, "#ffca7c", 0, 0.65, 0, 0.14, 0.065, 1.6);
    cylinder(bat, "#173c4b", 0, -0.03, 0, 0.075, 0.075, 0.3);
    bat.rotation.z = -0.65;
    bat.rotation.x = -0.6;
  }
  return { group: g, arm, bat, head };
}
export interface TargetModel {
  group: THREE.Group;
  moving: THREE.Object3D;
  extras: THREE.Object3D[];
  reaction: number;
  damaged: boolean;
  hit: boolean;
  restPosition: THREE.Vector3;
  surfaces: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[];
}
export function buildTargets(scene: THREE.Scene): Map<TargetId, TargetModel> {
  const models = new Map<TargetId, TargetModel>();
  for (const t of TARGETS) {
    const g = new THREE.Group();
    g.position.set(t.position.x, 0, t.position.z);
    scene.add(g);
    let moving: THREE.Object3D = g;
    const extras: THREE.Object3D[] = [];
    const surfaces: TargetModel["surfaces"] = [];
    const parts = TARGET_PARTS[t.id];
    if (parts) {
      const body = new THREE.Group();
      g.add(body);
      body.position.y = t.position.y;
      moving = body;
      for (const p of parts) {
        const material = mat(p.color, 0.45).clone();
        if (p.kind === "bowl") material.side = THREE.DoubleSide;
        const mesh = new THREE.Mesh(targetGeometry(p), material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        body.add(mesh);
        surfaces.push(mesh);
      }
    }
    if (t.id === "scoreboard") {
      const supportHeight = t.position.y - 6;
      for (const x of [-13, 13])
        box(g, "#325969", x, supportHeight / 2, 0, 1.4, supportHeight, 1.4);
      const sign = label(
        "SCOREBOARD SMASH",
        t.label + " BONUS",
        t.color,
        24,
        4,
      );
      sign.position.set(0, 39, 0);
      g.add(sign);
    }
    if (t.id === "lights") {
      for (const lamp of surfaces.slice(2)) {
        lamp.material.emissive.set("#fff1ae");
        lamp.material.emissiveIntensity = 1.2;
        extras.push(lamp);
      }
      const sign = label("LIGHTS OUT!", t.label + " BONUS", t.color, 15, 3.5);
      sign.position.set(-3, 34, 0);
      g.add(sign);
    }
    if (["baseball", "mascot", "sock"].includes(t.id)) {
      // Small platforms and tethers distinguish the toys from the real ball.
      cylinder(g, t.color, 0, 0.25, 0, 5.8, 6.2, 0.5);
      const tether = cylinder(g, "#f5ecd2", 0, 4, 0, 0.09, 0.09, 8);
      extras.push(tether);
      if (t.id === "baseball") {
        for (const sign of [-1, 1]) {
          const pts = Array.from({ length: 61 }, (_, i) => {
            const a = (i / 60) * Math.PI * 2;
            return new THREE.Vector3(
              sign * 2.5,
              5.5 * Math.sin(a),
              5.5 * Math.cos(a),
            );
          });
          moving.add(
            new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(pts),
              new THREE.LineBasicMaterial({ color: "#e95873" }),
            ),
          );
        }
      } else if (t.id === "mascot") {
        for (const x of [-1.7, 1.7]) {
          sphere(moving, "#fff6d6", x, 5.5, -3.4, 1.25);
          sphere(moving, "#143e51", x, 5.5, -4.3, 0.45);
        }
        sphere(moving, "#ffb879", 0, 3.9, -3.7, 1.1, 0.7, 0.7);
      } else {
        sphere(moving, "#f58192", -5.2, -3.45, 0, 2.1, 2.25, 2.52);
        sphere(moving, "#8de5df", 2.3, -3.2, 0.2, 2.3, 2.2, 2.5);
        for (const y of [4.9, 5.8]) {
          const stripe = new THREE.Mesh(
            new THREE.TorusGeometry(2.72, 0.16, 8, 32),
            mat("#fff9ef"),
          );
          stripe.rotation.x = Math.PI / 2;
          stripe.scale.y = 0.93;
          stripe.position.set(2, y, 0);
          moving.add(stripe);
        }
      }
      const sign = label(
        t.name.toUpperCase(),
        t.label + " BONUS",
        t.color,
        16,
        3.5,
      );
      sign.position.set(
        0,
        t.id === "mascot" ? 6.5 : t.id === "sock" ? 9 : t.position.y + 10,
        t.id === "mascot" || t.id === "sock" ? -5 : 0,
      );
      sign.userData.intactOnly = !!t.permanent;
      g.add(sign);
      if (t.permanent) {
        const damaged = label(
          t.id === "baseball" ? "POPPED!" : "ALL FLAT!",
          "BACK NEXT ROUND",
          t.color,
          16,
          3.5,
        );
        damaged.position.copy(sign.position);
        damaged.userData.damagedOnly = true;
        damaged.visible = false;
        g.add(damaged);
      }
    }
    if (t.id === "goal") {
      for (const x of [-10, 10])
        cylinder(g, "#fff9dc", x, 7, 0, 0.25, 0.25, 14);
      box(g, "#fff9dc", 0, 14, 0, 20.5, 0.5, 0.5);
      box(g, "#77ddcf", 0, 0.18, 3, 20.2, 0.3, 6);
      const net = new THREE.LineBasicMaterial({
        color: 0xdaf6db,
        transparent: true,
        opacity: 0.6,
      });
      const pts: number[] = [];
      for (let x = -10; x <= 10; x += 1.3) pts.push(x, 0, 5, x, 14, 0);
      for (let y = 0; y <= 14; y += 1.3)
        pts.push(-10, y, 5 * (1 - y / 14), 10, y, 5 * (1 - y / 14));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      g.add(new THREE.LineSegments(geo, net));
      const sign = label(
        "GOOOAAAL!",
        "HIT IT THROUGH · 3× POINTS",
        t.color,
        19,
        4,
      );
      sign.position.set(0, 17, 0);
      g.add(sign);
    }
    if (t.id === "dinosaur") {
      sphere(g, "#51c98a", 1, 5, 3, 5.2, 5.7, 4);
      sphere(g, "#b8ea84", 0, 4.4, -0.5, 3.2, 4, 1.8);
      for (const x of [-3, 3]) {
        sphere(g, "#43b781", x, 1.5, 1, 2, 1.5, 2.8);
        for (let i = -1; i <= 1; i++)
          sphere(g, "#ffefb7", x + i * 0.55, 0.8, -1.5, 0.3, 0.3, 0.5);
      }
      const neck = cylinder(g, "#51c98a", 0, 11, 2, 2.5, 3.5, 10);
      neck.rotation.x = -0.18;
      const head = new THREE.Group();
      head.position.set(0, 16, 0);
      g.add(head);
      moving = head;
      sphere(head, "#42b883", 0, 2, 0, 5, 3.2, 4);
      sphere(head, "#183e38", 0, -0.15, -2.8, 4.2, 1.9, 1.9);
      const jaw = sphere(head, "#77dc93", 0, -2, -0.3, 4.6, 1, 4);
      extras.push(jaw);
      for (const x of [-2.5, 2.5]) {
        sphere(head, "#fffce9", x, 3.5, -1.4, 1.35);
        sphere(head, "#173a35", x, 3.6, -2.56, 0.55);
        sphere(head, "#ffffff", x - 0.13, 3.85, -2.98, 0.17);
        sphere(head, "#247d65", x * 0.55, 1.7, -3.8, 0.4, 0.27, 0.14);
      }
      for (let i = -3; i <= 3; i++) {
        const tooth = cylinder(
          head,
          "#fff3c9",
          i * 0.88,
          0.9,
          -3.7,
          0.02,
          0.25,
          0.85,
          3,
        );
        tooth.rotation.z = Math.PI;
        cylinder(head, "#fff3c9", i * 0.88, -1.2, -3.7, 0.02, 0.25, 0.65, 3);
      }
      const tail = cylinder(g, "#51c98a", 5, 3, 5, 0.2, 2, 9);
      tail.rotation.z = -1.1;
      tail.rotation.x = 0.4;
      for (let i = 0; i < 6; i++) {
        const spike = cylinder(
          g,
          "#ffc956",
          0,
          5 + i * 1.8,
          5 - i * 0.25,
          0,
          0.8,
          1.5,
          3,
        );
        spike.rotation.x = 0.9;
      }
      for (const x of [-4, 4]) {
        const arm = sphere(g, "#51c98a", x, 7, -0.5, 1, 2, 0.9);
        arm.rotation.z = x > 0 ? -0.6 : 0.6;
      }
      const sign = label(
        "HUNGRY DINO",
        "IN THE MOUTH · +4,000",
        t.color,
        17,
        4,
      );
      sign.position.set(0, 24, 0);
      g.add(sign);
    }
    if (t.id === "ufo") {
      g.position.y = t.position.y;
      const hull = new THREE.Group();
      g.add(hull);
      moving = hull;
      sphere(hull, "#8874dc", 0, 0, 0, 7, 1.2, 5);
      sphere(hull, "#b1f5ec", 0, 1.1, 0, 3, 2.1, 2.7);
      cylinder(hull, "#544a91", 0, -0.8, 0, 4.5, 2.2, 0.9);
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        const light = sphere(
          hull,
          i % 2 ? "#ffe281" : "#a4ffde",
          6 * Math.sin(a),
          0.15,
          4.2 * Math.cos(a),
          0.42,
        );
        extras.push(light);
      }
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(6, 18, 24, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0x9bffe0,
          transparent: true,
          opacity: 0.065,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      beam.position.y = -10;
      g.add(beam);
      const sign = label(
        "SPACE INVADER",
        "DIRECT HIT · +3,000",
        t.color,
        17,
        4,
      );
      sign.position.y = 7;
      g.add(sign);
    }
    if (t.id === "icecream") {
      box(g, "#8de5df", 0, 4, 0, 12, 6, 6);
      box(g, "#f9e6af", 0, 7.1, 0, 12.5, 0.4, 6.5);
      box(g, "#f58192", -8, 3, 0, 4, 4, 5.8);
      box(g, "#a6e8e5", -8, 5, -0.03, 3.6, 1.8, 5.5);
      box(g, "#163e4c", 0, 4.4, -3.06, 7, 2.7, 0.1);
      box(g, "#fff5d6", 0, 2.8, -3.4, 8, 0.25, 1);
      for (let i = 0; i < 6; i++)
        box(
          g,
          i % 2 ? "#fff3d1" : "#ef6274",
          -5 + i * 2,
          6.8,
          -3.5,
          2,
          0.5,
          1.4,
        );
      for (const x of [-7, 4])
        for (const z of [-3, 3]) {
          const wheel = cylinder(g, "#24364c", x, 1.2, z, 1.25, 1.25, 0.6);
          wheel.rotation.x = Math.PI / 2;
          const hub = cylinder(g, "#f8ead2", x, 1.2, z * 1.11, 0.6, 0.6, 0.07);
          hub.rotation.x = Math.PI / 2;
        }
      cylinder(g, "#efb864", 0, 8.7, 0, 1.65, 0.25, 3.1, 24);
      sphere(g, "#fff9ef", 0, 10.5, 0, 2.15, 1.65, 2.05);
      sphere(g, "#f58192", 0, 12, 0, 1.5, 1.3, 1.5);
      sphere(g, "#e85857", 0, 13.25, 0, 0.35);
      for (let i = 0; i < 6; i++) {
        const cone = new THREE.Group();
        cylinder(cone, "#efb864", 0, -0.45, 0, 0.62, 0.05, 1.5);
        sphere(
          cone,
          ["#f58192", "#fff9ef", "#8de5df"][i % 3],
          0,
          0.55,
          0,
          0.85,
        );
        cone.visible = false;
        extras.push(cone);
        g.add(cone);
      }
      const sign = label("ICE CREAM", "SCOOP IT UP · +2,000", t.color, 18, 4);
      sign.position.set(0, 15, 0);
      g.add(sign);
    }
    if (t.id === "toilet") {
      cylinder(g, "#c3d9e2", 0, 2.3, 0, 2.2, 3, 4.6);
      const swirl = new THREE.Group();
      swirl.position.set(0, 6.6, -1);
      g.add(swirl);
      moving = swirl;
      const spiral = Array.from({ length: 100 }, (_, i) => {
        const a = (i / 99) * Math.PI * 7,
          radius = 0.3 + (i / 99) * 3.6;
        return new THREE.Vector3(
          Math.cos(a) * radius,
          0,
          Math.sin(a) * radius * 1.06,
        );
      });
      swirl.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(spiral),
          new THREE.LineBasicMaterial({ color: "#c0faff" }),
        ),
      );
      const seat = new THREE.Mesh(
        new THREE.TorusGeometry(4.55, 0.24, 10, 40),
        mat("#fefbec"),
      );
      seat.rotation.x = Math.PI / 2;
      seat.scale.y = 1.13;
      seat.position.set(0, 6.9, -1);
      g.add(seat);
      box(g, "#fdf8f0", 0, 7, 3, 7, 9, 3);
      box(g, "#b1d6df", 0, 11.6, 3, 7.5, 0.5, 3.5);
      box(g, "#ffbf57", -2.3, 9.6, 1.3, 1.2, 0.4, 0.4);
      for (let i = 0; i < 8; i++) {
        const duck = new THREE.Group();
        sphere(duck, "#ffd75c", 0, 0, 0, 0.65, 0.5, 0.85);
        sphere(duck, "#ffd75c", 0, 0.6, -0.4, 0.46);
        box(duck, "#ff9447", 0, 0.52, -0.86, 0.4, 0.18, 0.35);
        sphere(duck, "#173946", 0.2, 0.74, -0.74, 0.06);
        duck.visible = false;
        g.add(duck);
        extras.push(duck);
      }
      for (let i = 0; i < 12; i++) {
        const paper = box(g, "#fffdf2", 0, 7, 0, 0.5, 0.035, 1.8);
        paper.visible = false;
        extras.push(paper);
      }
      for (let i = 0; i < 12; i++) {
        const water = sphere(g, "#7de9ff", 0, 7, 0, 0.3, 0.9, 0.3);
        water.visible = false;
        extras.push(water);
      }
      const sign = label("FLUSHED IT!", "IN THE BOWL · +5,000", t.color, 18, 4);
      sign.position.set(0, 17, 0);
      g.add(sign);
    }
    models.set(t.id, {
      group: g,
      moving,
      extras,
      reaction: 0,
      damaged: false,
      hit: false,
      surfaces,
      restPosition: moving.position.clone(),
    });
  }
  return models;
}

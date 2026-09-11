import * as THREE from "three";
import stadiumLayout from "./stadium-layout.json";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  box,
  sphere,
  cylinder,
  character,
  label,
  buildTargets,
  mat,
} from "./models";
import type { Character, TargetModel } from "./models";
import { TARGETS } from "./types";
import { TARGET_REACTION_SECONDS } from "./target-shapes";
import type { TargetId, Vec3 } from "./types";
import { Effects } from "./effects";
import { BATTER_STANCE, CONTACT_Z, poseSwing } from "./batter";
import { VisualPolish, addContactShadows } from "./visual-polish";
import {
  upgradeBatter,
  upgradeDinosaur,
  type VisualAssets,
} from "./visual-assets";
const up = new THREE.Vector3(0, 1, 0);
type CrowdReaction =
  | "idle"
  | "contact"
  | "homeRun"
  | "crushed"
  | "toilet"
  | "lights";
interface CrowdPerson {
  angle: number;
  radius: number;
  baseY: number;
  size: number;
  row: number;
  detail: number;
  phase: number;
  speed: number;
  waveSide: -1 | 1;
  hairStyle: number;
  hasHat: boolean;
  hasGlasses: boolean;
  hasPlacard: boolean;
  hasFood: boolean;
  idlePose: number;
  talkSide: -1 | 1;
  child: boolean;
}
interface CrowdConfetti {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  color: THREE.Color;
}
interface CrowdSign {
  sprite: THREE.Sprite;
  baseY: number;
  phase: number;
}
interface CrowdActor {
  group: THREE.Group;
  body: THREE.Mesh;
  head: THREE.Mesh;
  hair: THREE.Mesh;
  ponytail: THREE.Mesh;
  hat: THREE.Mesh;
  brim: THREE.Mesh;
  arms: [THREE.Mesh, THREE.Mesh];
  eyes: [THREE.Mesh, THREE.Mesh];
  mouth: THREE.Mesh;
  glasses: [THREE.Mesh, THREE.Mesh];
  placard: THREE.Mesh;
  food: THREE.Mesh;
}
export class Rendering {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(57, 1, 0.1, 500);
  renderer: THREE.WebGLRenderer;
  effects: Effects;
  batter: Character;
  pitcher: Character;
  targets: Map<TargetId, TargetModel>;
  ball: THREE.Group;
  ballLeather!: THREE.MeshStandardMaterial;
  polish: VisualPolish;
  halo: THREE.Sprite;
  ballShadow: THREE.Mesh;
  zone: THREE.LineSegments;
  aimLine: THREE.Line;
  aimArrow: THREE.Mesh;
  sun = new THREE.DirectionalLight("#fff0d0", 2.25);
  ambient = new THREE.HemisphereLight("#d3eeff", "#a0b6a0", 1.8);
  fill = new THREE.DirectionalLight("#c6e6ff", 0.5);
  look = new THREE.Vector3(0, 6, 36);
  desired = new THREE.Vector3();
  desiredLook = new THREE.Vector3();
  shake = 0;
  swingTime = 0;
  swingContact: Vec3 = { x: 0, y: 1.65, z: CONTACT_Z };
  elapsed = 0;
  boardCanvas = document.createElement("canvas");
  boardTexture: THREE.CanvasTexture;
  lastBoard = "";
  reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  renderFrame = 0;
  crowdPeople: CrowdPerson[] = [];
  crowdActors: CrowdActor[] = [];
  crowdBodies!: THREE.InstancedMesh;
  crowdHeads!: THREE.InstancedMesh;
  crowdHair!: THREE.InstancedMesh;
  crowdPonytails!: THREE.InstancedMesh;
  crowdHats!: THREE.InstancedMesh;
  crowdHatBrims!: THREE.InstancedMesh;
  crowdArms!: THREE.InstancedMesh;
  crowdEyes!: THREE.InstancedMesh;
  crowdMouths!: THREE.InstancedMesh;
  crowdGlasses!: THREE.InstancedMesh;
  crowdPlacards!: THREE.InstancedMesh;
  crowdFood!: THREE.InstancedMesh;
  crowdConfetti!: THREE.InstancedMesh;
  crowdSigns: CrowdSign[] = [];
  crowdConfettiParticles: CrowdConfetti[] = [];
  crowdDummy = new THREE.Object3D();
  crowdReaction: CrowdReaction = "idle";
  crowdReactionAge = 99;
  crowdReactionDuration = 0;
  constructor(
    canvas: HTMLCanvasElement,
    public assets: VisualAssets = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene.background = new THREE.Color("#a5e1f4");
    this.scene.fog = new THREE.Fog("#bce9ed", 130, 300);
    this.sun.position.set(-38, 80, -30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -100,
      right: 100,
      top: 140,
      bottom: -50,
      near: 1,
      far: 250,
    });
    this.sun.shadow.bias = -0.001;
    this.sun.shadow.normalBias = 0.055;
    this.sun.shadow.intensity = 0.68;
    this.fill.position.set(34, 28, -26);
    this.fill.target.position.set(0, 8, 65);
    this.scene.add(this.sun, this.ambient, this.fill, this.fill.target);
    this.scene.add(this.sun.target);
    this.sun.target.position.z = 40;
    if (assets.field) {
      this.scene.add(assets.field);
      if (assets["home-plate"]) this.scene.add(assets["home-plate"]);
      else
        box(this.scene, "#fffae9", 0, 0.1, 0, 0.75, 0.13, 0.75).rotation.y =
          Math.PI / 4;
    } else this.field();
    if (assets.stadium) {
      this.scene.add(assets.stadium);
      this.createCrowd();
    } else this.stadium();
    this.scenery();
    addContactShadows(this.scene);
    this.mergeStaticGeometry();
    this.renderer.shadowMap.autoUpdate = false;
    this.targets = buildTargets(this.scene);
    upgradeDinosaur(this.targets.get("dinosaur")!, assets.dinosaur);
    this.polish = new VisualPolish(this.targets);
    this.batter = character(this.scene);
    this.batter.group.position.set(
      BATTER_STANCE.x,
      BATTER_STANCE.y,
      BATTER_STANCE.z,
    );
    this.batter.group.rotation.y = BATTER_STANCE.yaw;
    this.batter.group.scale.setScalar(BATTER_STANCE.scale);
    this.batter = upgradeBatter(this.batter, assets);
    this.pitcher = character(this.scene, true);
    this.pitcher.group.position.set(0, 0.22, 18);
    this.pitcher.group.scale.setScalar(1.12);
    this.ball = new THREE.Group();
    const baseball = sphere(this.ball, "#fffdf2", 0, 0, 0, 0.3);
    baseball.material = baseball.material.clone();
    this.ballLeather = baseball.material as THREE.MeshStandardMaterial;
    for (const sign of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        pts.push(
          new THREE.Vector3(
            sign * 0.135,
            0.268 * Math.sin(a),
            0.268 * Math.cos(a),
          ),
        );
      }
      const seam = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: "#dc4b54" }),
      );
      this.ball.add(seam);
    }
    if (assets.baseball) {
      this.ball.clear();
      this.ball.add(assets.baseball);
      assets.baseball.traverse((object) => {
        if (
          object instanceof THREE.Mesh &&
          (object.material as THREE.Material).name === "white"
        ) {
          this.ballLeather = object.material as THREE.MeshStandardMaterial;
        }
      });
    }
    this.scene.add(this.ball);
    this.ball.visible = false;
    const glow = document.createElement("canvas");
    glow.width = 128;
    glow.height = 128;
    const gc = glow.getContext("2d")!;
    // A crisp white/cyan rim with a dark keyline stays readable against grass AND sky.
    for (const [width, color] of [
      [14, "#123c4c"],
      [10, "#76ffff"],
      [5, "#ffffff"],
    ] as const) {
      gc.beginPath();
      gc.arc(64, 64, 44, 0, Math.PI * 2);
      gc.lineWidth = width;
      gc.strokeStyle = color;
      gc.stroke();
    }
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(glow),
        transparent: true,
        depthWrite: false,
        depthTest: false,
      }),
    );
    this.halo.scale.set(1, 1, 1);
    this.halo.renderOrder = 102;
    this.ball.add(this.halo);
    this.ball.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        (object.material as THREE.Material).depthTest = false;
        object.renderOrder = object instanceof THREE.Line ? 101 : 100;
      }
    });
    this.ballShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.48, 24),
      new THREE.MeshBasicMaterial({
        color: "#1b524b",
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      }),
    );
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.position.y = 0.035;
    this.scene.add(this.ballShadow);
    const edges = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(1.45, 1.16, 0.05),
    );
    this.zone = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({
        color: "#e6ffe4",
        transparent: true,
        opacity: 0.6,
      }),
    );
    this.zone.position.set(0, 1.65, CONTACT_Z);
    this.scene.add(this.zone);
    this.aimLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 26 }, () => new THREE.Vector3()),
      ),
      new THREE.LineDashedMaterial({
        color: "#d9ffc1",
        dashSize: 1.7,
        gapSize: 1.3,
        transparent: true,
        opacity: 0.5,
      }),
    );
    this.scene.add(this.aimLine);
    const triangle = new THREE.BufferGeometry();
    triangle.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [-1.5, 0.06, 0, 1.5, 0.06, 0, 0, 0.06, 3],
        3,
      ),
    );
    triangle.computeVertexNormals();
    this.aimArrow = new THREE.Mesh(
      triangle,
      new THREE.MeshBasicMaterial({
        color: "#deffc0",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
      }),
    );
    this.scene.add(this.aimArrow);
    this.boardCanvas.width = 1024;
    this.boardCanvas.height = 384;
    this.boardTexture = new THREE.CanvasTexture(this.boardCanvas);
    this.boardTexture.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(
        TARGETS.find((t) => t.id === "scoreboard")!.half.x * 2 - 2,
        12,
      ),
      new THREE.MeshBasicMaterial({ map: this.boardTexture }),
    );
    board.position.set(0, 0, -1.025);
    board.rotation.y = Math.PI;
    this.targets.get("scoreboard")!.moving.add(board);
    this.updateBoard("WELCOME, SLUGGER!", 0);
    this.effects = new Effects(this.scene);
    this.camera.position.set(5, 7.8, -14);
    this.camera.lookAt(this.look);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }
  resize() {
    const w = window.innerWidth,
      h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // Keep the same camera poses, follow motion and zoom; fit both foul corners
    // within the desktop frame instead of cropping them at the old fixed FOV.
    this.camera.fov = Math.max(
      w / h < 1 ? 72 : 57,
      Math.min(
        105,
        THREE.MathUtils.radToDeg(
          2 *
            Math.atan((Math.tan(THREE.MathUtils.degToRad(43)) * 1.4) / (w / h)),
        ),
      ),
    );
    // Short desktop windows need some sky reserved for the existing HUD.
    // An off-axis frame keeps the camera and all ball-follow transforms intact.
    this.camera.setViewOffset(w, h, 0, -Math.max(0, 850 - h) * 0.42, w, h);
    this.camera.updateProjectionMatrix();
  }
  mergeStaticGeometry() {
    this.scene.updateMatrixWorld(true);
    const batches = new Map<
      string,
      {
        material: THREE.Material;
        geometries: THREE.BufferGeometry[];
        shadow: boolean;
      }
    >();
    const meshes: THREE.Mesh[] = [];
    this.scene.traverse((o) => {
      if (
        o instanceof THREE.Mesh &&
        !o.userData.dynamicCrowd &&
        !(o instanceof THREE.InstancedMesh) &&
        !Array.isArray(o.material)
      )
        meshes.push(o);
    });
    for (const m of meshes) {
      const material = m.material as THREE.Material;
      const key = material.uuid + String(m.castShadow);
      if (!batches.has(key))
        batches.set(key, { material, geometries: [], shadow: m.castShadow });
      const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
      batches.get(key)!.geometries.push(g);
      m.removeFromParent();
      m.geometry.dispose();
    }
    for (const batch of batches.values()) {
      const geometry = mergeGeometries(batch.geometries);
      if (geometry) {
        const m = new THREE.Mesh(geometry, batch.material);
        m.castShadow = batch.shadow;
        m.receiveShadow = true;
        this.scene.add(m);
      }
      for (const g of batch.geometries) g.dispose();
    }
  }
  fan(
    inner: number,
    outer: number,
    color: string,
    y: number,
    start = -Math.PI / 3,
    end = Math.PI / 3,
  ) {
    const p: number[] = [];
    for (let i = 0; i < 80; i++) {
      const a = start + ((end - start) * i) / 80,
        b = start + ((end - start) * (i + 1)) / 80;
      p.push(
        inner * Math.sin(a),
        y,
        inner * Math.cos(a),
        outer * Math.sin(a),
        y,
        outer * Math.cos(a),
        outer * Math.sin(b),
        y,
        outer * Math.cos(b),
        inner * Math.sin(a),
        y,
        inner * Math.cos(a),
        outer * Math.sin(b),
        y,
        outer * Math.cos(b),
        inner * Math.sin(b),
        y,
        inner * Math.cos(b),
      );
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat(color));
    m.material.side = THREE.DoubleSide;
    m.receiveShadow = true;
    this.scene.add(m);
  }
  field() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 700),
      mat("#69b589"),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.12;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.fan(0, 75, "#cf966a", 0);
    for (let i = 0; i < 12; i++)
      this.fan(i * 6, (i + 1) * 6, i % 2 ? "#65b879" : "#71c482", 0.012);
    this.fan(0, 24, "#dba477", 0.03, -0.785, 0.785);
    const dirt = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 18),
      mat("#6fb67a"),
    );
    dirt.rotation.x = -Math.PI / 2;
    dirt.rotation.z = Math.PI / 4;
    dirt.position.set(0, 0.05, 15);
    dirt.receiveShadow = true;
    this.scene.add(dirt);
    const home = cylinder(
      this.scene,
      "#dba477",
      0,
      0.045,
      0,
      4.4,
      4.4,
      0.06,
      48,
    );
    home.receiveShadow = true;
    cylinder(this.scene, "#dba477", 0, 0.14, 18, 2.6, 2.9, 0.28, 48);
    box(this.scene, "#fff4d9", 0, 0.31, 18, 0.85, 0.03, 0.3);
    for (const [x, z] of [
      [0, 0],
      [-12.7, 12.7],
      [0, 25.4],
      [12.7, 12.7],
    ]) {
      const b = box(this.scene, "#fffae9", x, 0.1, z, 0.75, 0.13, 0.75);
      b.rotation.y = Math.PI / 4;
    }
    for (const s of [-1, 1]) {
      const pts = [
        new THREE.Vector3(0, 0.082, 0),
        new THREE.Vector3(
          (s * stadiumLayout.wallRadius) / Math.sqrt(2),
          0.082,
          stadiumLayout.wallRadius / Math.sqrt(2),
        ),
      ];
      this.scene.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: "#fff5d5" }),
        ),
      );
    }
    const points = [
      new THREE.Vector3(-1.9, 0.08, -1),
      new THREE.Vector3(-0.6, 0.08, -1),
      new THREE.Vector3(-0.6, 0.08, 1),
      new THREE.Vector3(-1.9, 0.08, 1),
      new THREE.Vector3(-1.9, 0.08, -1),
    ];
    this.scene.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: "#fff5d5",
          transparent: true,
          opacity: 0.8,
        }),
      ),
    );
  }
  createCrowd() {
    // Three separated seating bands keep the crowd legible and leave the
    // colorful bleacher faces visible between the people.
    const rowRadii = stadiumLayout.terraceRadii;
    const rowY = [4.9, 6.3, 7.7];
    const rowColors = ["#3b7890", "#315f7b", "#294e68"];
    for (let row = 0; row < rowRadii.length; row++) {
      const inner = rowRadii[row] - 1.25;
      this.fan(
        inner,
        inner + 2.5,
        rowColors[row],
        rowY[row] - 0.62,
        -1.25,
        1.25,
      );
      this.fan(
        inner - 0.08,
        inner + 0.38,
        "#183b50",
        rowY[row] - 0.92,
        -1.25,
        1.25,
      );
    }

    const rowCounts = [42, 58, 76];
    const count = rowCounts.reduce((sum, rowCount) => sum + rowCount, 0);
    const bodyColors = [
      "#f6c95f",
      "#f47f99",
      "#69d1c0",
      "#65aee6",
      "#f3e9cf",
      "#a891df",
      "#f08d4e",
      "#77c46e",
    ];
    const skinColors = [
      "#f4c49a",
      "#d99a6c",
      "#b8734f",
      "#8c543d",
      "#f0ad7b",
      "#70412f",
    ];
    const hairColors = [
      "#6a4636",
      "#9a603a",
      "#c47b45",
      "#e2a052",
      "#f0c36c",
      "#5d6f7a",
      "#874d73",
    ];
    const hatColors = ["#ef5d69", "#3b7fbd", "#f4bd54", "#805bc2", "#35a98c"];
    const seeded = (n: number) => {
      const value = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
      return value - Math.floor(value);
    };
    const create = (
      geometry: THREE.BufferGeometry,
      color: string,
      instances: number,
    ) => {
      const mesh = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color,
          vertexColors: true,
        }),
        instances,
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      return mesh;
    };
    this.crowdBodies = create(
      new THREE.CylinderGeometry(0.37, 0.44, 0.82, 8),
      "#ffffff",
      count,
    );
    this.crowdHeads = create(
      new THREE.SphereGeometry(1, 8, 6),
      "#ffffff",
      count,
    );
    this.crowdHair = create(
      new THREE.SphereGeometry(1, 8, 5),
      "#ffffff",
      count,
    );
    this.crowdPonytails = create(
      new THREE.SphereGeometry(1, 7, 5),
      "#ffffff",
      count,
    );
    this.crowdHats = create(
      new THREE.CylinderGeometry(0.26, 0.31, 0.17, 8),
      "#ffffff",
      count,
    );
    this.crowdHatBrims = create(
      new THREE.CylinderGeometry(0.4, 0.4, 0.055, 8),
      "#ffffff",
      count,
    );
    this.crowdArms = create(
      new THREE.CylinderGeometry(0.09, 0.12, 0.52, 6),
      "#ffffff",
      count * 2,
    );
    this.crowdEyes = create(
      new THREE.SphereGeometry(1, 5, 4),
      "#152d38",
      count * 2,
    );
    this.crowdMouths = create(new THREE.BoxGeometry(1, 1, 1), "#152d38", count);
    this.crowdGlasses = create(
      new THREE.BoxGeometry(1, 1, 1),
      "#182b38",
      count * 2,
    );
    this.crowdPlacards = create(
      new THREE.BoxGeometry(0.55, 0.34, 0.05),
      "#ffffff",
      count,
    );
    this.crowdFood = create(
      new THREE.SphereGeometry(1, 6, 4),
      "#f4bd54",
      count,
    );
    this.crowdConfetti = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.22, 0.12, 0.06),
      new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false }),
      90,
    );
    this.crowdConfetti.count = 0;
    this.crowdConfetti.frustumCulled = false;
    this.scene.add(this.crowdConfetti);

    const dummy = this.crowdDummy;
    const place = (
      mesh: THREE.InstancedMesh,
      index: number,
      angle: number,
      radius: number,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      rx = 0,
      rz = 0,
    ) => {
      dummy.position.set(
        radius * Math.sin(angle) + Math.cos(angle) * x + Math.sin(angle) * z,
        y,
        radius * Math.cos(angle) - Math.sin(angle) * x + Math.cos(angle) * z,
      );
      dummy.rotation.set(rx, angle, rz);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    };
    const actorBodyGeometry = new THREE.CylinderGeometry(0.37, 0.44, 0.82, 8);
    const actorHeadGeometry = new THREE.SphereGeometry(1, 10, 7);
    const actorHairGeometry = new THREE.SphereGeometry(1, 8, 5);
    const actorArmGeometry = new THREE.CylinderGeometry(0.09, 0.12, 0.52, 6);
    const actorHatGeometry = new THREE.CylinderGeometry(0.26, 0.31, 0.17, 8);
    const actorBrimGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.055, 8);
    const actorEyeGeometry = new THREE.SphereGeometry(0.045, 5, 4);
    const actorMouthGeometry = new THREE.BoxGeometry(0.12, 0.035, 0.025);
    const actorGlassesGeometry = new THREE.BoxGeometry(0.1, 0.045, 0.025);
    const actorPlacardGeometry = new THREE.BoxGeometry(0.55, 0.34, 0.05);
    const actorFoodGeometry = new THREE.SphereGeometry(0.11, 6, 4);
    const actorPart = (geometry: THREE.BufferGeometry, color: string) => {
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ color }),
      );
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.userData.dynamicCrowd = true;
      return mesh;
    };
    let index = 0;
    for (let row = 0; row < rowCounts.length; row++) {
      const rowCount = rowCounts[row];
      const detail = row === 0 ? 2 : row === 1 ? 1 : 0;
      for (let i = 0; i < rowCount; i++) {
        const seed = row * 1000 + i;
        const angle =
          -1.22 + ((i + 0.5 + (seeded(seed) - 0.5) * 0.28) * 2.44) / rowCount;
        const radius = rowRadii[row] + (seeded(seed + 1) - 0.5) * 0.45;
        const child = seeded(seed + 2) > 0.72 && row < 2;
        const size =
          (detail === 2 ? 1.16 : detail === 1 ? 0.92 : 0.72) *
          (child ? 0.78 : 1) *
          (0.94 + seeded(seed + 3) * 0.12);
        const poseRoll = seeded(seed + 16);
        const person: CrowdPerson = {
          angle,
          radius,
          baseY: rowY[row] + (row === 0 ? 0.25 : 0),
          size,
          row,
          detail,
          phase: seeded(seed + 4) * Math.PI * 2,
          speed: 0.75 + seeded(seed + 5) * 0.8,
          waveSide: seeded(seed + 6) > 0.5 ? 1 : -1,
          hairStyle: Math.floor(seeded(seed + 7) * 4),
          hasHat: seeded(seed + 8) > (row < 2 ? 0.66 : 0.8),
          hasGlasses: detail > 0 && seeded(seed + 9) > 0.78,
          hasPlacard: row < 2 && seeded(seed + 10) > 0.9,
          hasFood: row < 2 && seeded(seed + 17) > 0.9,
          idlePose:
            poseRoll < 0.7
              ? 0
              : poseRoll < 0.8
                ? 1
                : poseRoll < 0.88
                  ? 2
                  : poseRoll < 0.94
                    ? 3
                    : 4,
          talkSide: seeded(seed + 18) > 0.5 ? 1 : -1,
          child,
        };
        this.crowdPeople.push(person);
        const shirt =
          bodyColors[Math.floor(seeded(seed + 11) * bodyColors.length)];
        const shirtColor = new THREE.Color(shirt);
        if (row === 2) shirtColor.multiplyScalar(0.72);
        const skinColor = new THREE.Color(
          skinColors[Math.floor(seeded(seed + 12) * skinColors.length)],
        );
        if (row === 2) skinColor.multiplyScalar(0.86);
        const hair =
          hairColors[Math.floor(seeded(seed + 13) * hairColors.length)];
        const hat = hatColors[Math.floor(seeded(seed + 14) * hatColors.length)];
        const actorGroup = new THREE.Group();
        actorGroup.position.set(
          radius * Math.sin(angle),
          0,
          radius * Math.cos(angle),
        );
        actorGroup.rotation.y = angle;
        const actorBody = actorPart(actorBodyGeometry, shirt);
        actorBody.position.y = person.baseY + size * 0.43;
        actorBody.scale.set(size, size, size);
        const actorHead = actorPart(
          actorHeadGeometry,
          `#${skinColor.getHexString()}`,
        );
        actorHead.position.set(0, person.baseY + size * 1.15, -0.01);
        actorHead.scale.set(size * 0.34, size * 0.37, size * 0.32);
        const actorHair = actorPart(actorHairGeometry, hair);
        actorHair.position.set(0, person.baseY + size * 1.43, 0.01);
        actorHair.scale.set(
          size * (person.hairStyle === 2 ? 0.3 : 0.32),
          size * 0.13,
          size * (person.hairStyle === 2 ? 0.28 : 0.3),
        );
        const actorPonytail = actorPart(actorHairGeometry, hair);
        actorPonytail.position.set(
          person.hairStyle === 2 ? 0.27 * size : 0,
          person.baseY + size * 1.24,
          0.28 * size,
        );
        actorPonytail.scale.set(
          person.hairStyle === 2 ? 0.14 * size : 0,
          person.hairStyle === 2 ? 0.18 * size : 0,
          person.hairStyle === 2 ? 0.14 * size : 0,
        );
        actorPonytail.visible = person.hairStyle === 2;
        const actorHat = actorPart(actorHatGeometry, hat);
        actorHat.position.y = person.baseY + size * 1.61;
        actorHat.scale.setScalar(person.hasHat ? size : 0);
        actorHat.visible = person.hasHat;
        const actorBrim = actorPart(actorBrimGeometry, hat);
        actorBrim.position.set(0, person.baseY + size * 1.53, -0.08 * size);
        actorBrim.scale.setScalar(person.hasHat ? size : 0);
        actorBrim.visible = person.hasHat;
        const actorArms: [THREE.Mesh, THREE.Mesh] = [
          actorPart(actorArmGeometry, shirt),
          actorPart(actorArmGeometry, shirt),
        ];
        actorArms[0].position.set(-0.43 * size, person.baseY + size * 0.9, 0);
        actorArms[0].rotation.z = -0.12;
        actorArms[1].position.set(0.43 * size, person.baseY + size * 0.9, 0);
        actorArms[1].rotation.z = 0.12;
        const actorEyes: [THREE.Mesh, THREE.Mesh] = [
          actorPart(actorEyeGeometry, "#152d38"),
          actorPart(actorEyeGeometry, "#152d38"),
        ];
        actorEyes[0].position.set(
          -0.105 * size,
          person.baseY + size * 1.19,
          -0.3 * size,
        );
        actorEyes[1].position.set(
          0.105 * size,
          person.baseY + size * 1.19,
          -0.3 * size,
        );
        actorEyes[0].visible = actorEyes[1].visible = detail > 0;
        const actorMouth = actorPart(actorMouthGeometry, "#4a2630");
        actorMouth.position.set(0, person.baseY + size * 1.04, -0.315 * size);
        actorMouth.scale.set(
          detail > 0 ? size : 0,
          detail > 0 ? size : 0,
          detail > 0 ? size : 0,
        );
        actorMouth.visible = detail > 0;
        const actorGlasses: [THREE.Mesh, THREE.Mesh] = [
          actorPart(actorGlassesGeometry, "#182b38"),
          actorPart(actorGlassesGeometry, "#182b38"),
        ];
        actorGlasses[0].position.set(
          -0.105 * size,
          person.baseY + size * 1.19,
          -0.322 * size,
        );
        actorGlasses[1].position.set(
          0.105 * size,
          person.baseY + size * 1.19,
          -0.322 * size,
        );
        actorGlasses[0].visible = actorGlasses[1].visible = person.hasGlasses;
        const actorPlacard = actorPart(
          actorPlacardGeometry,
          bodyColors[
            (Math.floor(seeded(seed + 15) * bodyColors.length) + 3) %
              bodyColors.length
          ],
        );
        actorPlacard.position.set(0, person.baseY + size * 1.63, 0);
        actorPlacard.scale.setScalar(person.hasPlacard ? size : 0);
        actorPlacard.visible = person.hasPlacard;
        const actorFood = actorPart(
          actorFoodGeometry,
          index % 2 ? "#f4bd54" : "#f18b62",
        );
        actorFood.position.set(
          person.hasFood ? 0.28 * size : 0,
          person.baseY + size * 1.08,
          -0.34 * size,
        );
        actorFood.visible = person.hasFood;
        actorGroup.add(
          actorBody,
          actorHead,
          actorHair,
          actorPonytail,
          actorHat,
          actorBrim,
          actorArms[0],
          actorArms[1],
          actorEyes[0],
          actorEyes[1],
          actorMouth,
          actorGlasses[0],
          actorGlasses[1],
          actorPlacard,
          actorFood,
        );
        this.scene.add(actorGroup);
        this.crowdActors.push({
          group: actorGroup,
          body: actorBody,
          head: actorHead,
          hair: actorHair,
          ponytail: actorPonytail,
          hat: actorHat,
          brim: actorBrim,
          arms: actorArms,
          eyes: actorEyes,
          mouth: actorMouth,
          glasses: actorGlasses,
          placard: actorPlacard,
          food: actorFood,
        });
        this.crowdBodies.setColorAt(index, shirtColor);
        this.crowdHeads.setColorAt(index, skinColor);
        this.crowdHair.setColorAt(index, new THREE.Color(hair));
        this.crowdPonytails.setColorAt(index, new THREE.Color(hair));
        this.crowdHats.setColorAt(index, new THREE.Color(hat));
        this.crowdHatBrims.setColorAt(index, new THREE.Color(hat));
        this.crowdPlacards.setColorAt(
          index,
          new THREE.Color(
            bodyColors[
              (Math.floor(seeded(seed + 15) * bodyColors.length) + 3) %
                bodyColors.length
            ],
          ),
        );
        this.crowdArms.setColorAt(index * 2, shirtColor);
        this.crowdArms.setColorAt(index * 2 + 1, shirtColor);
        this.crowdGlasses.setColorAt(index * 2, new THREE.Color("#182b38"));
        this.crowdGlasses.setColorAt(index * 2 + 1, new THREE.Color("#182b38"));
        this.crowdMouths.setColorAt(index, new THREE.Color("#4a2630"));
        this.crowdFood.setColorAt(
          index,
          new THREE.Color(index % 2 ? "#f4bd54" : "#f18b62"),
        );

        place(
          this.crowdBodies,
          index,
          angle,
          radius,
          0,
          person.baseY + size * 0.43,
          0,
          size,
          size,
          size,
        );
        place(
          this.crowdHeads,
          index,
          angle,
          radius,
          0,
          person.baseY + size * 1.15,
          -0.01,
          size * 0.34,
          size * 0.37,
          size * 0.32,
        );
        const hairScale =
          person.hairStyle === 2 ? [0.3, 0.13, 0.28] : [0.32, 0.13, 0.3];
        place(
          this.crowdHair,
          index,
          angle,
          radius,
          0,
          person.baseY + size * 1.43,
          0.01,
          hairScale[0] * size,
          hairScale[1] * size,
          hairScale[2] * size,
        );
        place(
          this.crowdPonytails,
          index,
          angle,
          radius,
          person.hairStyle === 2 ? 0.27 * size : 0,
          person.baseY + size * 1.24,
          0.28 * size,
          person.hairStyle === 2 ? 0.14 * size : 0,
          person.hairStyle === 2 ? 0.18 * size : 0,
          person.hairStyle === 2 ? 0.14 * size : 0,
        );
        place(
          this.crowdHats,
          index,
          angle,
          radius,
          0,
          person.baseY + size * 1.61,
          0,
          person.hasHat ? size : 0,
          person.hasHat ? size : 0,
          person.hasHat ? size : 0,
        );
        place(
          this.crowdHatBrims,
          index,
          angle,
          radius,
          0,
          person.baseY + size * 1.53,
          -0.08 * size,
          person.hasHat ? size : 0,
          person.hasHat ? size : 0,
          person.hasHat ? size : 0,
        );
        place(
          this.crowdEyes,
          index * 2,
          angle,
          radius,
          -0.105 * size,
          person.baseY + size * 1.19,
          -0.3 * size,
          detail > 0 ? size : 0,
          detail > 0 ? size : 0,
          detail > 0 ? size : 0,
        );
        place(
          this.crowdEyes,
          index * 2 + 1,
          angle,
          radius,
          0.105 * size,
          person.baseY + size * 1.19,
          -0.3 * size,
          detail > 0 ? size : 0,
          detail > 0 ? size : 0,
          detail > 0 ? size : 0,
        );
        place(
          this.crowdMouths,
          index,
          angle,
          radius,
          0,
          person.baseY + size * 1.04,
          -0.315 * size,
          detail > 0 ? 0.08 * size : 0,
          detail > 0 ? 0.035 * size : 0,
          detail > 0 ? 0.025 * size : 0,
        );
        place(
          this.crowdGlasses,
          index * 2,
          angle,
          radius,
          -0.105 * size,
          person.baseY + size * 1.19,
          -0.322 * size,
          person.hasGlasses ? 0.11 * size : 0,
          person.hasGlasses ? 0.045 * size : 0,
          person.hasGlasses ? 0.025 * size : 0,
        );
        place(
          this.crowdGlasses,
          index * 2 + 1,
          angle,
          radius,
          0.105 * size,
          person.baseY + size * 1.19,
          -0.322 * size,
          person.hasGlasses ? 0.11 * size : 0,
          person.hasGlasses ? 0.045 * size : 0,
          person.hasGlasses ? 0.025 * size : 0,
        );
        place(
          this.crowdArms,
          index * 2,
          angle,
          radius,
          -0.43 * size,
          person.baseY + size * 0.9,
          0,
          size,
          size,
          size,
          0,
          -0.12,
        );
        place(
          this.crowdArms,
          index * 2 + 1,
          angle,
          radius,
          0.43 * size,
          person.baseY + size * 0.9,
          0,
          size,
          size,
          size,
          0,
          0.12,
        );
        place(
          this.crowdPlacards,
          index,
          angle,
          radius,
          0,
          person.baseY + size * 1.63,
          0,
          person.hasPlacard ? size : 0,
          person.hasPlacard ? size : 0,
          person.hasPlacard ? size : 0,
        );
        place(
          this.crowdFood,
          index,
          angle,
          radius,
          person.hasFood ? 0.28 * size : 0,
          person.baseY + size * 1.08,
          -0.34 * size,
          person.hasFood ? 0.11 * size : 0,
          person.hasFood ? 0.11 * size : 0,
          person.hasFood ? 0.11 * size : 0,
        );
        index++;
      }
    }
    for (const mesh of [
      this.crowdBodies,
      this.crowdHeads,
      this.crowdHair,
      this.crowdPonytails,
      this.crowdHats,
      this.crowdHatBrims,
      this.crowdArms,
      this.crowdEyes,
      this.crowdMouths,
      this.crowdGlasses,
      this.crowdPlacards,
      this.crowdFood,
    ]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.count = 0;
    }

    const phrases = ["GO KYLE!", "CRUSH IT!", "HOME RUN!", "FLUSH IT!"];
    const signAngles = [-0.94, -0.38, 0.38, 0.94];
    for (let i = 0; i < phrases.length; i++) {
      const angle = signAngles[i];
      const g = new THREE.Group();
      g.position.set(
        stadiumLayout.crowdSignRadius * Math.sin(angle),
        0,
        stadiumLayout.crowdSignRadius * Math.cos(angle),
      );
      g.rotation.y = angle;
      this.scene.add(g);
      const sign = label(
        phrases[i],
        "",
        ["#ffcb69", "#9df1d0", "#ff9db4", "#a9ddff"][i],
        5.4,
        1.45,
      );
      sign.position.y = 10.5 + (i % 2) * 0.35;
      g.add(sign);
      cylinder(g, "#e6d5b2", 0, 7.7, 0, 0.07, 0.07, 6.2, 8);
      this.crowdSigns.push({
        sprite: sign,
        baseY: sign.position.y,
        phase: i * 1.7,
      });
    }
  }
  stadium() {
    for (let i = 0; i < 52; i++) {
      const a = -1.04 + ((i + 0.5) * 2.08) / 52;
      const g = new THREE.Group();
      g.position.set(72 * Math.sin(a), 0, 72 * Math.cos(a));
      g.rotation.y = a;
      this.scene.add(g);
      box(g, i % 8 < 4 ? "#176b77" : "#207a83", 0, 2, 0, 3, 4, 0.85);
      box(g, "#ffdc83", 0, 4.1, 0, 3.05, 0.23, 1.05);
      if (i % 7 === 0) {
        const marker = label(
          `${Math.round(72 * 3.28)} FT`,
          "",
          "#ffeeb9",
          5.5,
          1.5,
        );
        marker.position.set(0, 2.3, -0.65);
        g.add(marker);
      }
    }
    for (const side of [-1, 1]) {
      const a = side * stadiumLayout.foulAngle;
      const x = stadiumLayout.wallRadius * Math.sin(a),
        z = stadiumLayout.wallRadius * Math.cos(a);
      cylinder(
        this.scene,
        "#ffeb16",
        x,
        stadiumLayout.poleHeight / 2,
        z,
        stadiumLayout.poleRadius,
        stadiumLayout.poleRadius,
        stadiumLayout.poleHeight,
      );
      for (const y of [19, 20.25, 21.5, 22.75, 24])
        box(this.scene, "#ffeb16", x - side * 0.425, y, z, 0.85, 0.07, 0.07);
      cylinder(this.scene, "#ffeb16", x - side * 0.85, 21.5, z, 0.04, 0.04, 5);
    }
    this.createCrowd();
    for (let i = 0; i < 12; i++) {
      const a = -1.22 + (i * 2.44) / 11;
      const g = new THREE.Group();
      g.position.set(
        stadiumLayout.canopyRadius * Math.sin(a),
        0,
        stadiumLayout.canopyRadius * Math.cos(a),
      );
      g.rotation.y = a;
      this.scene.add(g);
      box(g, "#31556c", 0, 8, 0, 1, 16, 1);
      const sign = label(
        i % 3 === 0
          ? "MAKE SOME NOISE"
          : i % 3 === 1
            ? "SWING FOR SILLY"
            : "CHAOS PARK",
        "",
        i % 2 ? "#ffc986" : "#a4f1d5",
        17,
        3,
      );
      sign.position.y = 14.5;
      g.add(sign);
      cylinder(g, "#e6d5b2", 0, 19, 0, 0.1, 0.1, 8);
      const flag = box(
        g,
        i % 2 ? "#fc7894" : "#ffca60",
        1.5,
        22,
        0,
        3,
        1.7,
        0.05,
      );
      flag.rotation.y = 0.25;
    }
    for (const [x, z] of stadiumLayout.floodlights) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      this.scene.add(g);
      cylinder(g, "#547b89", 0, 19, 0, 0.4, 0.7, 38);
      box(g, "#325365", 0, 37, 0, 10, 3.8, 1);
      for (let i = 0; i < 5; i++)
        for (let j = 0; j < 2; j++)
          box(g, "#fff8d3", -4 + i * 2, 36.1 + j * 1.8, -0.6, 1.3, 1.1, 0.25);
    }
  }

  scenery() {
    for (let i = 0; i < 28; i++) {
      const x = -200 + i * 15;
      const height = 10 + Math.sin(i * 1.9) * 7;
      const b = box(
        this.scene,
        i % 2 ? "#85bcbf" : "#8fc6c7",
        x,
        height / 2,
        250 + Math.sin(i) * 12,
        10,
        height,
        11,
      );
      b.castShadow = false;
    }
    for (let i = 0; i < 13; i++) {
      const x = Math.sin(i * 5) * 160,
        z = 195 + Math.cos(i * 3) * 15;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      this.scene.add(g);
      cylinder(g, "#a68e63", 0, 5, 0, 0.7, 1, 10);
      sphere(g, "#56a582", 0, 13, 0, 6, 8, 6);
      sphere(g, "#63b790", 3, 11, 1, 4, 5, 4);
    }
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      g.position.set(
        -180 + i * 40,
        48 + Math.sin(i * 2) * 12,
        120 + Math.cos(i) * 30,
      );
      this.scene.add(g);
      for (let j = 0; j < 4; j++) {
        const c = sphere(
          g,
          "#eef8eb",
          j * 5,
          Math.sin(j * 2) * 2,
          0,
          6,
          3.3,
          3.5,
        );
        c.castShadow = false;
      }
    }
  }
  updateBoard(player: string, score: number, golden = false) {
    const boardReaction = this.targets.get("scoreboard")?.reaction ?? 0;
    const age = TARGET_REACTION_SECONDS - boardReaction;
    const flash =
      boardReaction > 0 ? (Math.sin(age * Math.PI * 3.6) + 1) / 2 : 0;
    const key =
      player + score + golden + (boardReaction > 0 ? Math.floor(age * 20) : "");
    if (key === this.lastBoard) return;
    this.lastBoard = key;
    const c = this.boardCanvas.getContext("2d")!;
    c.fillStyle =
      boardReaction > 0
        ? flash > 0.5
          ? "#fff2a1"
          : "#74e9d4"
        : golden
          ? "#704c22"
          : "#123642";
    c.fillRect(0, 0, 1024, 384);
    c.fillStyle = "#7ddfc1";
    for (let i = 0; i < 50; i++) {
      c.globalAlpha = 0.08;
      c.fillRect(i * 22, 0, 2, 384);
    }
    c.globalAlpha = 1;
    c.textAlign = "center";
    c.fillStyle =
      boardReaction > 0 ? "#153e56" : golden ? "#ffda69" : "#fffae7";
    c.font = "900 65px Segoe UI";
    c.fillText(
      boardReaction > 0
        ? "SCOREBOARD SMASH!"
        : golden
          ? "GOLDEN BALL FINALE"
          : player.toUpperCase(),
      512,
      100,
      940,
    );
    c.font = "900 148px Segoe UI";
    const numbers =
      boardReaction > 0
        ? score + Math.round(4000 * Math.min(1, age / 1.8))
        : score;
    c.fillText(numbers.toLocaleString().padStart(5, "0"), 512, 256);
    c.fillStyle = "#7ee5c6";
    c.font = "700 34px Segoe UI";
    c.fillText(
      boardReaction > 0 ? "+4,000 BONUS!" : "BIG SWINGS. BIGGER SMILES.",
      512,
      339,
    );
    this.boardTexture.needsUpdate = true;
  }
  crowdMatrix(
    mesh: THREE.InstancedMesh,
    index: number,
    person: CrowdPerson,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rx = 0,
    ry = person.angle,
    rz = 0,
  ) {
    this.crowdDummy.position.set(
      person.radius * Math.sin(person.angle) +
        Math.cos(person.angle) * x +
        Math.sin(person.angle) * z,
      y,
      person.radius * Math.cos(person.angle) -
        Math.sin(person.angle) * x +
        Math.cos(person.angle) * z,
    );
    this.crowdDummy.rotation.set(rx, ry, rz);
    this.crowdDummy.scale.set(sx, sy, sz);
    this.crowdDummy.updateMatrix();
    mesh.setMatrixAt(index, this.crowdDummy.matrix);
  }
  crowdReact(reaction: CrowdReaction) {
    this.crowdReaction = reaction;
    this.crowdReactionAge = reaction === "idle" ? 99 : 0;
    this.crowdReactionDuration =
      reaction === "crushed"
        ? 3.2
        : reaction === "homeRun"
          ? 2.8
          : reaction === "contact"
            ? 1.25
            : reaction === "idle"
              ? 0
              : 2.25;
    if (reaction !== "crushed") this.crowdConfettiParticles.length = 0;
    if (reaction === "crushed") {
      const colors = ["#ffcf45", "#ff7e9b", "#76e4cf", "#9edcff", "#fff3b0"];
      for (let i = 0; i < 70; i++) {
        const life = 1.8 + Math.random() * 1.4;
        this.crowdConfettiParticles.push({
          position: new THREE.Vector3(
            (Math.random() - 0.5) * 86,
            5.4 + Math.random() * 4,
            111 + Math.random() * 18,
          ),
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 7,
            6 + Math.random() * 8,
            (Math.random() - 0.5) * 4,
          ),
          life,
          maxLife: life,
          color: new THREE.Color(colors[i % colors.length]),
        });
      }
    }
  }
  updateCrowd(dt: number) {
    if (!this.crowdPeople.length) return;
    this.crowdReactionAge += dt;
    const event =
      this.crowdReactionAge < this.crowdReactionDuration
        ? this.crowdReaction
        : "idle";
    const motion = this.reducedMotion ? 0.35 : 1;
    for (let i = 0; i < this.crowdPeople.length; i++) {
      const person = this.crowdPeople[i];
      const size = person.size;
      const idle = Math.sin(this.elapsed * person.speed + person.phase);
      let lift = Math.max(0, idle) * 0.025 * motion;
      let headTurn =
        Math.sin(this.elapsed * 0.55 + person.phase) * 0.055 * motion;
      let lookUp = 0;
      let leftRaised = false;
      let rightRaised = false;
      let clap = false;
      let laughing = false;
      let pointing = false;
      let noseHold = false;
      let eating = false;
      let talking = false;
      if (event === "idle") {
        const posePulse = Math.sin(this.elapsed * person.speed + person.phase);
        if (person.idlePose === 1 && posePulse > 0.35) {
          leftRaised = person.waveSide < 0;
          rightRaised = person.waveSide > 0;
        } else if (person.idlePose === 2 && posePulse > -0.1) {
          clap = true;
        } else if (person.idlePose === 3 && posePulse > -0.2) {
          eating = true;
          rightRaised = true;
          headTurn += 0.08 * person.talkSide;
        } else if (person.idlePose === 4) {
          talking = true;
          headTurn += 0.13 * person.talkSide;
        }
      } else if (event === "contact" && (i + person.row * 3) % 4 === 0) {
        lift +=
          Math.max(0, Math.sin(this.crowdReactionAge * 9 + person.phase)) *
          0.26 *
          motion;
        leftRaised = person.waveSide < 0;
        rightRaised = person.waveSide > 0;
      } else if (event === "homeRun" && (i * 5 + person.row) % 7 !== 0) {
        lift +=
          Math.max(
            0,
            Math.sin(this.crowdReactionAge * 10 + person.phase * 0.35),
          ) *
          0.62 *
          motion;
        leftRaised = Math.sin(this.crowdReactionAge * 7 + person.phase) > -0.2;
        rightRaised =
          Math.sin(this.crowdReactionAge * 7 + person.phase + 1.3) > 0.2;
        clap = (i + person.row) % 3 === 0;
      } else if (event === "crushed") {
        const sync = Math.max(0, Math.sin(this.crowdReactionAge * 10.5));
        lift += sync * 0.86 * motion;
        leftRaised =
          Math.sin(this.crowdReactionAge * 8 + person.phase * 0.2) > -0.45;
        rightRaised =
          Math.sin(this.crowdReactionAge * 8 + person.phase * 0.2 + 1.1) >
          -0.45;
        clap = (i + person.row) % 2 === 0;
      } else if (event === "toilet" && (i * 7 + person.row) % 5 === 0) {
        noseHold = i % 3 === 0;
        pointing = !noseHold && i % 2 === 0;
        laughing = !noseHold && !pointing;
        lift +=
          Math.max(0, Math.sin(this.crowdReactionAge * 8 + person.phase)) *
          0.14 *
          motion;
        headTurn += (pointing ? 0.16 : -0.12) * motion;
      } else if (
        event === "lights" &&
        person.row < 5 &&
        person.angle < -0.28 &&
        person.angle > -1.16
      ) {
        lookUp = -0.34 * motion;
        headTurn += 0.12 * motion;
        leftRaised = i % 3 === 0;
      }
      if (talking) lift += Math.max(0, idle) * 0.045 * motion;
      const bodyY = person.baseY + size * 0.43 + lift;
      this.crowdMatrix(
        this.crowdBodies,
        i,
        person,
        0,
        bodyY,
        0,
        size,
        size,
        size,
        0,
        person.angle,
        lift * 0.07,
      );
      const headY = person.baseY + size * 1.15 + lift;
      this.crowdMatrix(
        this.crowdHeads,
        i,
        person,
        0,
        headY,
        -0.01,
        size * 0.34,
        size * 0.37,
        size * 0.32,
        lookUp,
        person.angle + headTurn,
      );
      this.crowdMatrix(
        this.crowdHair,
        i,
        person,
        0,
        headY + size * 0.28,
        0.01,
        size * (person.hairStyle === 2 ? 0.3 : 0.32),
        size * 0.13,
        size * (person.hairStyle === 2 ? 0.28 : 0.3),
        lookUp,
        person.angle + headTurn,
      );
      this.crowdMatrix(
        this.crowdPonytails,
        i,
        person,
        person.hairStyle === 2 ? 0.27 * size : 0,
        headY + size * 0.08,
        0.28 * size,
        person.hairStyle === 2 ? 0.14 * size : 0,
        person.hairStyle === 2 ? 0.18 * size : 0,
        person.hairStyle === 2 ? 0.14 * size : 0,
        lookUp,
        person.angle + headTurn,
      );
      const hatScale = person.hasHat ? size : 0;
      this.crowdMatrix(
        this.crowdHats,
        i,
        person,
        0,
        headY + size * 0.46,
        0,
        hatScale,
        hatScale,
        hatScale,
        lookUp,
        person.angle + headTurn,
      );
      this.crowdMatrix(
        this.crowdHatBrims,
        i,
        person,
        0,
        headY + size * 0.38,
        -0.08 * size,
        hatScale,
        hatScale,
        hatScale,
        lookUp,
        person.angle + headTurn,
      );
      const faceScale = person.detail > 0 ? size : 0;
      this.crowdMatrix(
        this.crowdEyes,
        i * 2,
        person,
        -0.105 * size,
        headY + size * 0.04,
        -0.3 * size,
        faceScale,
        faceScale,
        faceScale,
        lookUp,
        person.angle + headTurn,
      );
      this.crowdMatrix(
        this.crowdEyes,
        i * 2 + 1,
        person,
        0.105 * size,
        headY + size * 0.04,
        -0.3 * size,
        faceScale,
        faceScale,
        faceScale,
        lookUp,
        person.angle + headTurn,
      );
      const mouthWidth = laughing ? 0.13 : pointing ? 0.1 : 0.08;
      this.crowdMatrix(
        this.crowdMouths,
        i,
        person,
        0,
        headY - size * 0.11,
        -0.315 * size,
        faceScale * mouthWidth,
        faceScale * (laughing ? 0.06 : 0.035),
        faceScale * 0.025,
        lookUp,
        person.angle + headTurn,
      );
      const glassesScale = person.hasGlasses ? size : 0;
      this.crowdMatrix(
        this.crowdGlasses,
        i * 2,
        person,
        -0.105 * size,
        headY + size * 0.04,
        -0.322 * size,
        glassesScale * 0.11,
        glassesScale * 0.045,
        glassesScale * 0.025,
        lookUp,
        person.angle + headTurn,
      );
      this.crowdMatrix(
        this.crowdGlasses,
        i * 2 + 1,
        person,
        0.105 * size,
        headY + size * 0.04,
        -0.322 * size,
        glassesScale * 0.11,
        glassesScale * 0.045,
        glassesScale * 0.025,
        lookUp,
        person.angle + headTurn,
      );
      const armPose = (side: -1 | 1, raised: boolean, clapArm: boolean) => {
        const y =
          person.baseY + size * (raised ? (clapArm ? 1.4 : 1.28) : 0.9) + lift;
        const x = side * size * (raised && clapArm ? 0.2 : 0.43);
        const rotation = raised ? side * (clapArm ? 0.42 : 0.86) : side * 0.12;
        return { x, y, rotation };
      };
      const left = armPose(-1, leftRaised || clap, clap);
      const right = armPose(1, rightRaised || clap || noseHold, clap);
      this.crowdMatrix(
        this.crowdArms,
        i * 2,
        person,
        left.x,
        left.y,
        0,
        size,
        size,
        size,
        0,
        person.angle,
        left.rotation,
      );
      this.crowdMatrix(
        this.crowdArms,
        i * 2 + 1,
        person,
        right.x,
        right.y,
        0,
        size,
        size,
        size,
        0,
        person.angle,
        right.rotation,
      );
      const placardLift = person.hasPlacard
        ? size * (leftRaised || rightRaised ? 0.2 : 0)
        : 0;
      this.crowdMatrix(
        this.crowdPlacards,
        i,
        person,
        0,
        person.baseY + size * 1.63 + lift + placardLift,
        0,
        person.hasPlacard ? size : 0,
        person.hasPlacard ? size : 0,
        person.hasPlacard ? size : 0,
        0,
        person.angle,
        Math.sin(this.elapsed * 2 + person.phase) * 0.08,
      );
      const foodX = eating ? 0.2 * person.talkSide * size : 0.28 * size;
      const foodY = eating
        ? headY - size * 0.08
        : person.baseY + size * 1.08 + lift;
      this.crowdMatrix(
        this.crowdFood,
        i,
        person,
        person.hasFood ? foodX : 0,
        foodY,
        -0.34 * size,
        person.hasFood ? 0.11 * size : 0,
        person.hasFood ? 0.11 * size : 0,
        person.hasFood ? 0.11 * size : 0,
        lookUp,
        person.angle + headTurn,
      );
      const actor = this.crowdActors[i];
      actor.body.position.y = bodyY;
      actor.body.rotation.z = lift * 0.07;
      actor.body.scale.set(size, size, size);
      actor.head.position.y = headY;
      actor.head.rotation.set(lookUp, headTurn, 0);
      actor.hair.position.y = headY + size * 0.28;
      actor.hair.rotation.set(lookUp, headTurn, 0);
      actor.ponytail.position.set(
        person.hairStyle === 2 ? 0.27 * size : 0,
        headY + size * 0.08,
        0.28 * size,
      );
      actor.ponytail.rotation.set(lookUp, headTurn, 0);
      actor.hat.position.y = headY + size * 0.46;
      actor.hat.rotation.set(lookUp, headTurn, 0);
      actor.brim.position.set(0, headY + size * 0.38, -0.08 * size);
      actor.brim.rotation.set(lookUp, headTurn, 0);
      actor.eyes[0].position.set(
        -0.105 * size,
        headY + size * 0.04,
        -0.3 * size,
      );
      actor.eyes[1].position.set(
        0.105 * size,
        headY + size * 0.04,
        -0.3 * size,
      );
      actor.eyes[0].rotation.set(lookUp, headTurn, 0);
      actor.eyes[1].rotation.set(lookUp, headTurn, 0);
      actor.eyes[0].scale.setScalar(size);
      actor.eyes[1].scale.setScalar(size);
      actor.mouth.position.set(0, headY - size * 0.11, -0.315 * size);
      actor.mouth.scale.set(
        mouthWidth / 0.08,
        laughing ? 1.7 : talking ? 1.25 : 1,
        1,
      );
      actor.mouth.rotation.set(lookUp, headTurn, 0);
      actor.glasses[0].position.set(
        -0.105 * size,
        headY + size * 0.04,
        -0.322 * size,
      );
      actor.glasses[1].position.set(
        0.105 * size,
        headY + size * 0.04,
        -0.322 * size,
      );
      actor.glasses[0].rotation.set(lookUp, headTurn, 0);
      actor.glasses[1].rotation.set(lookUp, headTurn, 0);
      actor.glasses[0].scale.setScalar(size);
      actor.glasses[1].scale.setScalar(size);
      actor.arms[0].position.set(left.x, left.y, 0);
      actor.arms[0].rotation.z = left.rotation;
      actor.arms[1].position.set(right.x, right.y, 0);
      actor.arms[1].rotation.z = right.rotation;
      actor.placard.position.y =
        person.baseY + size * 1.63 + lift + placardLift;
      actor.placard.rotation.z =
        Math.sin(this.elapsed * 2 + person.phase) * 0.08;
      actor.food.visible = person.hasFood;
      actor.food.position.set(foodX, foodY, -0.34 * size);
    }
    for (const mesh of [
      this.crowdBodies,
      this.crowdHeads,
      this.crowdHair,
      this.crowdPonytails,
      this.crowdHats,
      this.crowdHatBrims,
      this.crowdArms,
      this.crowdEyes,
      this.crowdMouths,
      this.crowdGlasses,
      this.crowdPlacards,
      this.crowdFood,
    ])
      mesh.instanceMatrix.needsUpdate = true;
    for (const sign of this.crowdSigns) {
      const bounce =
        event === "crushed"
          ? Math.max(0, Math.sin(this.crowdReactionAge * 10)) * 0.85
          : event === "homeRun"
            ? Math.max(0, Math.sin(this.crowdReactionAge * 7 + sign.phase)) *
              0.35
            : 0;
      sign.sprite.position.y = sign.baseY + bounce;
      sign.sprite.rotation.z =
        event === "crushed"
          ? Math.sin(this.crowdReactionAge * 8 + sign.phase) * 0.12
          : Math.sin(this.elapsed * 0.5 + sign.phase) * 0.025;
    }
    for (let i = this.crowdConfettiParticles.length - 1; i >= 0; i--) {
      const particle = this.crowdConfettiParticles[i];
      particle.life -= dt;
      if (particle.life <= 0) {
        this.crowdConfettiParticles.splice(i, 1);
        continue;
      }
      particle.velocity.y -= 8 * dt;
      particle.position.addScaledVector(particle.velocity, dt);
      this.crowdDummy.position.copy(particle.position);
      this.crowdDummy.rotation.set(
        particle.life * 5,
        particle.life * 4,
        particle.life * 3,
      );
      this.crowdDummy.scale.setScalar(
        0.7 + Math.min(1, particle.life * 2) * 0.45,
      );
      this.crowdDummy.updateMatrix();
      this.crowdConfetti.setMatrixAt(i, this.crowdDummy.matrix);
      this.crowdConfetti.setColorAt(i, particle.color);
    }
    this.crowdConfetti.count = this.crowdConfettiParticles.length;
    this.crowdConfetti.instanceMatrix.needsUpdate = true;
    if (this.crowdConfetti.instanceColor)
      this.crowdConfetti.instanceColor.needsUpdate = true;
  }
  swing(contact: Vec3 = { x: 0, y: 1.65, z: CONTACT_Z }) {
    this.swingTime = 0.42;
    this.swingContact = { ...contact };
    poseSwing(this.batter, 0, this.swingContact);
  }
  react(id: TargetId) {
    const t = this.targets.get(id)!;
    t.reaction = TARGET_REACTION_SECONDS;
    t.hit = true;
    if (TARGETS.find((target) => target.id === id)?.permanent) t.damaged = true;
  }
  resetTargets(round = false) {
    this.crowdReact("idle");
    for (const [id, t] of this.targets) {
      if (round) t.damaged = false;
      t.hit = false;
      t.reaction = 0;
      if (!t.damaged) {
        t.moving.position.copy(t.restPosition);
        t.moving.rotation.set(0, 0, 0);
        t.moving.scale.setScalar(1);
      }
      if (id === "lights")
        for (const surface of t.surfaces.slice(2)) {
          surface.material.color.set("#fff8d3");
          surface.material.emissiveIntensity = 1.2;
        }
      if (id === "scoreboard") t.surfaces[0].material.emissiveIntensity = 0;
      if (id === "toilet" || id === "pizza")
        t.extras.forEach((e) => {
          e.visible = false;
        });
      if (round && ["baseball", "hotdog"].includes(id))
        t.extras.forEach((e) => {
          e.visible = true;
        });
    }
    this.lastBoard = "";
    this.effects.particles.length = 0;
  }
  update(
    dt: number,
    opts: {
      ball: Vec3;
      flight: boolean;
      pitching: boolean;
      progress: number;
      aim: number;
      golden: boolean;
      perfect: boolean;
      menu: boolean;
      visible: boolean;
      paused: boolean;
      reactionTarget?: TargetId | null;
    },
  ) {
    if (!opts.paused) this.elapsed += dt;
    const time = this.elapsed;
    if (!opts.paused) {
      this.swingTime = Math.max(0, this.swingTime - dt);
      poseSwing(
        this.batter,
        this.swingTime > 0 ? (0.42 - this.swingTime) / 0.42 : null,
        this.swingContact,
      );
      this.batter.head.rotation.y = Math.sin(time * 0.6) * 0.07;
      this.pitcher.arm.rotation.x = opts.pitching
        ? -Math.sin(Math.min(1, opts.progress * 4) * Math.PI) * 2.5
        : Math.sin(time * 2) * 0.15;
      for (const [id, t] of this.targets) {
        t.reaction = Math.max(0, t.reaction - dt);
        const r = t.reaction;
        if (id === "ufo") {
          t.group.position.x = Math.sin(time * 0.24) * 13;
          t.group.position.y = 25 + Math.sin(time) * 1.2;
          t.moving.rotation.y += dt * (r ? 9 : 0.25);
          t.moving.rotation.z = r
            ? Math.sin(time * 18) * 0.3
            : Math.sin(time) * 0.06;
          t.extras.forEach((e, i) =>
            e.scale.setScalar(r ? 1.2 + Math.sin(time * 22 + i) * 0.45 : 1),
          );
        }
        if (id === "dinosaur") {
          t.moving.rotation.z =
            Math.sin(time * (r ? 10 : 0.8)) * (r ? 0.09 : 0.025);
          t.extras[0].position.y =
            -2 + (r ? Math.sin(time * 13) * 0.65 : Math.sin(time * 1.4) * 0.2);
        }
        if (id === "pizza")
          t.extras.forEach((e, i) => {
            e.visible = r > 0;
            if (r) {
              const p = TARGET_REACTION_SECONDS - r;
              e.position.set(
                Math.sin(i * 2.4) * p * 5,
                7 + p * (11 + (i % 3)) - p * p * 6,
                Math.cos(i * 2.4) * p * 4,
              );
              e.rotation.set(p * 2, i + p * 3, p);
            }
          });
        const age = TARGET_REACTION_SECONDS - r;
        if (id === "scoreboard") {
          const material = t.surfaces[0].material;
          material.emissive.set("#ffe28a");
          material.emissiveIntensity =
            r > 0 ? 0.7 + Math.sin(age * Math.PI * 3.6) * 0.5 : 0;
        }
        if (id === "lights")
          for (const bulb of t.surfaces.slice(2)) {
            const lit = !t.hit
              ? 1
              : r > 1.45
                ? Math.sin(age * 25) > 0
                  ? 0.85
                  : 0.08
                : 0.06;
            bulb.material.color.setScalar(lit);
            bulb.material.emissiveIntensity = lit * 1.2;
          }
        if (id === "toilet") {
          if (r > 0) t.moving.rotation.y -= dt * (8 + age * 4);
          t.extras.forEach((e, i) => {
            e.visible = r > 0 && i < 16;
            if (r <= 0) return;
            const a = age * 6 + i * 2.4;
            const radius = Math.max(0.25, 3.8 - age * 1.5);
            e.position.set(
              Math.cos(a) * radius,
              6.7 + Math.sin(a * 2) * 0.15,
              -1 + Math.sin(a) * radius * 1.1,
            );
            e.rotation.y = -a;
            e.scale.setScalar(Math.max(0.1, 1 - age * 0.4));
          });
        }
        if (id === "mascot") {
          t.moving.rotation.z =
            r > 0 ? Math.sin(age * 16) * 0.36 * Math.exp(-age * 1.6) : 0;
          t.moving.scale.set(
            1 + (r > 0 ? Math.sin(age * 20) * 0.09 : 0),
            1 - (r > 0 ? Math.sin(age * 20) * 0.07 : 0),
            1,
          );
        }
        if (t.damaged && (id === "baseball" || id === "hotdog")) {
          const progress = Math.min(1, age / (id === "baseball" ? 0.55 : 1.6));
          const sizeY = 1 - progress * 0.94;
          t.moving.scale.set(1 + progress * 0.15, sizeY, 1 + progress * 0.1);
          t.moving.position.y =
            t.restPosition.y * (1 - progress) + progress * 0.7;
          t.moving.rotation.z =
            id === "baseball" ? Math.sin(age * 16) * (1 - progress) * 0.25 : 0;
          t.extras.forEach((e) => {
            e.visible = false;
          });
        }
        if (id === "goal")
          t.group.scale.setScalar(r ? 1 + Math.sin(time * 14) * 0.025 : 1);
      }
      this.updateCrowd(dt);
    }
    this.ballLeather.color.set(opts.golden ? "#ffd04f" : "#fffdf2");
    this.ball.visible = opts.visible;
    this.ball.position.set(opts.ball.x, opts.ball.y, opts.ball.z);
    this.ball.rotation.x += dt * 8;
    this.ball.rotation.y += dt * 4;
    this.halo.material.color.set(opts.golden ? "#ffdb72" : "#ffffff");
    this.halo.scale.setScalar(opts.golden ? 1.1 : 1);
    this.ballShadow.visible = opts.visible;
    this.ballShadow.position.set(opts.ball.x, 0.08, opts.ball.z);
    this.ballShadow.scale.setScalar(1 + Math.max(0, opts.ball.y) * 0.014);
    this.zone.visible = !opts.flight;
    const zm = this.zone.material as THREE.LineBasicMaterial;
    zm.opacity = opts.pitching ? 0.35 + Math.min(1, opts.progress) * 0.4 : 0.3;
    zm.color.set(opts.pitching && opts.progress > 0.78 ? "#fff8b1" : "#dbffe8");
    const angle = opts.aim * 0.68;
    const pos = this.aimLine.geometry.attributes.position;
    for (let i = 0; i < 26; i++) {
      const d = 3 + i * 2.4;
      pos.setXYZ(i, Math.sin(angle) * d, 0.08, Math.cos(angle) * d);
    }
    pos.needsUpdate = true;
    this.aimLine.computeLineDistances();
    this.aimLine.visible = !opts.flight;
    this.aimArrow.visible = !opts.flight;
    this.aimArrow.position.set(Math.sin(angle) * 65, 0, Math.cos(angle) * 65);
    this.aimArrow.rotation.y = angle;
    if (opts.reactionTarget) {
      const p = opts.ball;
      const target = this.targets.get(opts.reactionTarget)!;
      const focusY = target.damaged
        ? (p.y + target.moving.position.y) * 0.5
        : p.y + 1;
      this.desired.set(p.x + 11, Math.max(15, p.y + 10), p.z - 29);
      this.desiredLook.set(p.x, focusY, p.z + 2);
    } else if (opts.flight) {
      const p = opts.ball;
      this.desired.set(p.x * 0.78 + 9, Math.max(10, p.y * 0.8 + 7), p.z - 22);
      this.desiredLook.set(p.x, p.y + 1.1, p.z + 8);
    } else if (opts.menu) {
      this.desired.set(7, 10, -22);
      this.desiredLook.set(0, 3, 45);
    } else {
      this.desired.set(this.camera.aspect < 1 ? 1.5 : 4, 7, -21);
      this.desiredLook.set(0, 3, 24);
    }
    const zoom = opts.menu
      ? 1
      : opts.reactionTarget
        ? 1.05
        : opts.flight
          ? 1.18
          : 1.4;
    this.camera.zoom = THREE.MathUtils.lerp(
      this.camera.zoom,
      zoom,
      1 - Math.exp(-dt * 5),
    );
    this.camera.updateProjectionMatrix();
    this.camera.position.lerp(
      this.desired,
      1 - Math.exp(-dt * (opts.flight ? 2.5 : 3.7)),
    );
    this.look.lerp(this.desiredLook, 1 - Math.exp(-dt * 4));
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.camera.up.copy(up);
    this.camera.lookAt(this.look);
    if (!this.reducedMotion && this.shake > 0 && !opts.paused) {
      this.camera.rotateX(Math.sin(time * 80) * this.shake * 0.008);
      this.camera.rotateZ(Math.sin(time * 63) * this.shake * 0.005);
    }
    this.sun.color.lerp(
      new THREE.Color(opts.golden ? "#ffd39b" : "#fff0d0"),
      dt,
    );
    this.effects.update(
      opts.paused ? 0 : dt,
      opts.ball,
      opts.visible && (opts.pitching || opts.flight),
      opts.golden,
      opts.flight && opts.perfect,
    );
    if (this.renderFrame++ % 6 === 0)
      this.renderer.shadowMap.needsUpdate = true;
    this.polish.update(
      opts.paused ? 0 : dt,
      this.camera,
      opts.menu,
      opts.reactionTarget,
    );
    this.renderer.render(this.scene, this.camera);
  }
  framing() {
    const original = this.camera.clone();
    original.zoom = 1;
    original.position.set(4, 7, -21);
    original.lookAt(0, 4.7, 34);
    original.updateProjectionMatrix();
    original.updateMatrixWorld();
    this.camera.updateMatrixWorld();
    const objects = {
      batter: [-1.5, 0, -0.35, 2.75],
      pitcher: [0, 0.22, 18, 2.7],
      ball: [0, 1.35, 0, 0.6],
      strikeZone: [0, 1.07, 0.1, 1.16],
    };
    return Object.fromEntries(
      Object.entries(objects).map(([name, [x, y, z, height]]) => {
        const pixels = (camera: THREE.Camera) =>
          (Math.abs(
            new THREE.Vector3(x, y, z).project(camera).y -
              new THREE.Vector3(x, y + height, z).project(camera).y,
          ) *
            innerHeight) /
          2;
        return [
          name,
          {
            before: pixels(original),
            after: pixels(this.camera),
            ratio: pixels(this.camera) / pixels(original),
          },
        ];
      }),
    );
  }
}

import RAPIER from "@dimforge/rapier3d-compat";
import { TARGET_PARTS, targetGeometry } from "./target-shapes";
import { TARGETS } from "./types";
import type { TargetId, Vec3 } from "./types";
/** Approximate the unobstructed landing point with the same arcade gravity and drag. */
export function estimateLandingDistance(position: Vec3, velocity: Vec3) {
  let { x, y, z } = position;
  let { x: vx, y: vy, z: vz } = velocity;
  const dt = 1 / 30;
  for (let i = 0; i < 360 && y > 0.2; i++) {
    vy -= 13.8 * dt;
    const damping = 1 / (1 + 0.055 * dt);
    vx *= damping;
    vy *= damping;
    vz *= damping;
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
  }
  return Math.round(Math.hypot(x, z) * 3.28084);
}
export class Physics {
  world: RAPIER.World;
  ball: RAPIER.RigidBody;
  bat: RAPIER.RigidBody;
  ballCollider: RAPIER.Collider;
  events = new RAPIER.EventQueue(true);
  tags = new Map<number, string>();
  targetBodies = new Map<TargetId, RAPIER.RigidBody>();
  accumulator = 0;
  hitTargets = new Set<TargetId>();
  damagedTargets = new Set<TargetId>();
  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -13.8, z: 0 });
    this.world.timestep = 1 / 60;
    this.fixedBox(
      { x: 0, y: -0.55, z: 50 },
      { x: 180, y: 0.5, z: 190 },
      "ground",
    );
    for (let i = 0; i < 52; i++) {
      const a = -1.04 + ((i + 0.5) * 2.08) / 52;
      this.fixedBox(
        { x: 72 * Math.sin(a), y: 2, z: 72 * Math.cos(a) },
        { x: 1.48, y: 2, z: 0.45 },
        "wall",
        a,
      );
    }
    for (let i = 0; i < 26; i++) {
      const a = -1.08 + ((i + 0.5) * 2.16) / 26;
      this.fixedBox(
        { x: 119 * Math.sin(a), y: 5, z: 119 * Math.cos(a) },
        { x: 5, y: 5, z: 4 },
        "stadium",
        a,
      );
    }
    for (const t of TARGETS) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
          t.position.x,
          t.position.y,
          t.position.z,
        ),
      );
      const parts = TARGET_PARTS[t.id];
      const descriptions = parts
        ? parts.map((part) => {
            const geometry = targetGeometry(part);
            const vertices = new Float32Array(
              geometry.attributes.position.array,
            );
            const desc =
              part.kind === "bowl"
                ? RAPIER.ColliderDesc.trimesh(
                    vertices,
                    new Uint32Array(geometry.index!.array),
                  )
                : RAPIER.ColliderDesc.convexHull(vertices)!;
            geometry.dispose();
            return desc;
          })
        : [RAPIER.ColliderDesc.cuboid(t.half.x, t.half.y, t.half.z)];
      for (const description of descriptions) {
        const c = this.world.createCollider(
          description
            .setSensor(true)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
          body,
        );
        this.tags.set(c.handle, t.id);
      }
      this.targetBodies.set(t.id, body);
    }
    const goal = TARGETS.find((t) => t.id === "goal")!;
    for (const side of [-1, 1])
      this.fixedBox(
        { x: goal.position.x + side * 10.4, y: 7, z: 83 },
        { x: 0.3, y: 7, z: 0.3 },
        "goalpost",
      );
    this.fixedBox(
      { x: -29, y: 14.3, z: 83 },
      { x: 10.7, y: 0.3, z: 0.3 },
      "goalpost",
    );
    this.ball = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, -10, 0)
        .setCcdEnabled(true)
        .setLinearDamping(0.055)
        .setCanSleep(false),
    );
    this.ballCollider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(0.26)
        .setRestitution(0.48)
        .setFriction(0.4)
        .setDensity(1)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.ball,
    );
    this.bat = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        -1.5,
        1.8,
        0,
      ),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.66 * 1.12, 0.14 * 1.12).setSensor(true),
      this.bat,
    );
    this.hideBall();
  }
  fixedBox(p: Vec3, h: Vec3, tag: string, angle = 0) {
    const c = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(h.x, h.y, h.z)
        .setTranslation(p.x, p.y, p.z)
        .setRotation({
          x: 0,
          y: Math.sin(angle / 2),
          z: 0,
          w: Math.cos(angle / 2),
        })
        .setRestitution(0.5)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    );
    this.tags.set(c.handle, tag);
  }
  hideBall() {
    this.ball.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    this.ball.setTranslation({ x: 0, y: -10, z: 0 }, true);
    this.ball.setNextKinematicTranslation({ x: 0, y: -10, z: 0 });
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }
  pitch(p: Vec3) {
    this.ball.setNextKinematicTranslation(p);
  }
  launch(p: Vec3, v: Vec3) {
    this.hitTargets.clear();
    this.ball.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    this.ball.setTranslation(p, true);
    this.ball.setLinvel(v, true);
    this.ball.setAngvel({ x: 7, y: 3, z: 5 }, true);
  }
  captureBall(p: Vec3) {
    this.ball.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    this.ball.setTranslation(p, true);
    this.ball.setNextKinematicTranslation(p);
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.accumulator = 0;
  }
  damageTarget(id: TargetId) {
    this.damagedTargets.add(id);
    this.targetBodies.get(id)?.setEnabled(false);
  }
  resetTargets(round = false) {
    this.hitTargets.clear();
    if (round) this.damagedTargets.clear();
    for (const [id, body] of this.targetBodies)
      body.setEnabled(!this.damagedTargets.has(id));
  }
  moveTarget(id: TargetId, p: Vec3) {
    this.targetBodies.get(id)?.setNextKinematicTranslation(p);
  }
  step(dt: number, collision: (tag: string) => void) {
    this.accumulator = Math.min(this.accumulator + dt, 0.2);
    while (this.accumulator >= 1 / 60) {
      const before = { ...this.position() };
      const wasDynamic = this.ball.isDynamic();
      this.world.step(this.events);
      if (wasDynamic) {
        const after = this.position();
        const delta = {
          x: after.x - before.x,
          y: after.y - before.y,
          z: after.z - before.z,
        };
        // Sweep the baseball through each fixed step. Thin panels and the open
        // bowl must not miss fast hits, or trigger at an oversized bounding box.
        const hit = this.world.castShape(
          before,
          { x: 0, y: 0, z: 0, w: 1 },
          delta,
          new RAPIER.Ball(0.26),
          0,
          1,
          true,
          undefined,
          undefined,
          this.ballCollider,
          this.ball,
          (collider) => {
            const id = this.tags.get(collider.handle) as TargetId;
            return (
              this.targetBodies.has(id) &&
              !this.hitTargets.has(id) &&
              !this.damagedTargets.has(id)
            );
          },
        );
        if (hit) {
          const id = this.tags.get(hit.collider.handle) as TargetId;
          this.hitTargets.add(id);
          this.ball.setTranslation(
            {
              x: before.x + delta.x * hit.time_of_impact,
              y: before.y + delta.y * hit.time_of_impact,
              z: before.z + delta.z * hit.time_of_impact,
            },
            true,
          );
          collision(id);
        }
      }
      this.events.drainCollisionEvents((a, b, started) => {
        if (!started) return;
        const other =
          a === this.ballCollider.handle
            ? b
            : b === this.ballCollider.handle
              ? a
              : null;
        if (other !== null) {
          const tag = this.tags.get(other);
          if (tag && !this.targetBodies.has(tag as TargetId)) collision(tag);
          // Target hits are handled by the precise sweep above, exactly once.
        }
      });
      if (wasDynamic && !this.ball.isDynamic()) {
        this.accumulator = 0;
        break;
      }
      this.accumulator -= 1 / 60;
    }
  }
  position(): Vec3 {
    return this.ball.translation();
  }
  velocity(): Vec3 {
    return this.ball.linvel();
  }
}
export async function initPhysics() {
  await RAPIER.init();
  return new Physics();
}

import * as THREE from "three";
import type { Vec3 } from "./types";
interface Particle {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
  color: THREE.Color;
  size: number;
}
export class Effects {
  particles: Particle[] = [];
  mesh: THREE.InstancedMesh;
  dummy = new THREE.Object3D();
  trail: THREE.Mesh[] = [];
  cursor = 0;
  lastTrail = 0;
  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial(),
      650,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    for (let i = 0; i < 32; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(1, 6, 4),
        new THREE.MeshBasicMaterial({
          color: 0xffcf45,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          depthTest: false,
        }),
      );
      m.visible = false;
      m.renderOrder = 98;
      scene.add(m);
      this.trail.push(m);
    }
  }
  burst(p: Vec3, color: string, count = 70, power = 11) {
    for (let i = 0; i < count && this.particles.length < 650; i++) {
      const life = 0.7 + Math.random() * 1.4;
      this.particles.push({
        p: new THREE.Vector3(p.x, p.y, p.z),
        v: new THREE.Vector3(
          (Math.random() - 0.5) * power,
          Math.random() * power,
          (Math.random() - 0.5) * power,
        ),
        life,
        max: life,
        color: new THREE.Color(i % 4 === 0 ? "#fff9da" : color),
        size: 0.12 + Math.random() * 0.28,
      });
    }
  }
  update(
    dt: number,
    ball: Vec3,
    moving: boolean,
    golden: boolean,
    powerful = false,
  ) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.v.y -= 9 * dt;
      p.p.addScaledVector(p.v, dt);
      this.dummy.position.copy(p.p);
      this.dummy.rotation.set(p.life * 3, p.life * 2, 0);
      this.dummy.scale.setScalar(p.size * Math.min(1, p.life * 3));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, p.color);
    }
    this.mesh.count = this.particles.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.lastTrail += dt;
    for (const t of this.trail) {
      const m = t.material as THREE.MeshBasicMaterial;
      m.opacity = Math.max(0, m.opacity - dt * (powerful ? 2.6 : 4.8));
      t.scale.multiplyScalar(Math.max(0, 1 - dt * 3));
      t.visible = m.opacity > 0;
    }
    if (moving && dt > 0 && this.lastTrail > 0.016) {
      this.lastTrail = 0;
      const t = this.trail[this.cursor++ % this.trail.length];
      t.position.set(ball.x, ball.y, ball.z);
      t.scale.setScalar(powerful ? 0.28 : 0.18);
      const m = t.material as THREE.MeshBasicMaterial;
      m.opacity = 0.85;
      m.color.set(golden ? "#ffd15d" : powerful ? "#76faff" : "#ddffff");
      t.visible = true;
    }
  }
  clearTrail() {
    for (const t of this.trail) {
      t.visible = false;
      (t.material as THREE.MeshBasicMaterial).opacity = 0;
    }
  }
}

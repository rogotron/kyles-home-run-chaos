import type { Vec3 } from "./types";
import { CONTACT_Z } from "./batter";
export const CONTACT_ADVANCE = 0.1;
export class Pitching {
  elapsed = 0;
  duration = 1.55;
  location = { x: 0, y: 1.65 };
  swung = false;
  start(predictable = false) {
    this.elapsed = 0;
    this.swung = false;
    this.duration = predictable ? 1.55 : 1.48 + Math.random() * 0.16;
    this.location = predictable
      ? { x: 0, y: 1.65 }
      : { x: (Math.random() - 0.5) * 0.8, y: 1.4 + Math.random() * 0.5 };
  }
  get progress() {
    return this.elapsed / this.contactTime;
  }
  get contactTime() {
    return this.duration - CONTACT_ADVANCE;
  }
  get error() {
    return this.elapsed - this.contactTime;
  }
  position(): Vec3 {
    const t = this.progress;
    // Ease into a readable contact corridor. The generous timing windows should
    // keep the ball within bat reach, not several metres in front of/behind Kyle.
    // Position and speed are continuous where the final approach becomes linear.
    const remaining = this.contactTime - this.elapsed;
    const approachSpeed = 2;
    const approach = Math.max(0, remaining - 0.36) / (this.contactTime - 0.36);
    return {
      x: this.location.x * t,
      y:
        2.8 +
        (this.location.y - 2.8) * t +
        Math.sin(Math.min(1, t) * Math.PI) * 0.45,
      z:
        CONTACT_Z +
        approachSpeed * remaining +
        (18 - CONTACT_Z - approachSpeed * this.contactTime) *
          approach *
          approach,
    };
  }
}

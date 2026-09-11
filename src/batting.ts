import { GOOD_WINDOW, CONTACT_WINDOW } from "./scoring";
import { TARGETS } from "./types";
import type { Quality, Target, Vec3 } from "./types";
export function exitVelocity(
  quality: Quality,
  aim: number,
  location: { x: number; y: number },
  timingError = quality === "Early" ? -0.5 : quality === "Late" ? 0.5 : 0,
): Vec3 {
  const power = quality === "Perfect" ? 48 : quality === "Good" ? 42 : 34;
  const angle =
    (quality === "Perfect" ? 37 : quality === "Good" ? 33 : 27) +
    (location.y - 1.65) * 9;
  // From behind this left-handed batter, +X is left field (opposite field)
  // and -X is right field (pull). Poor timing increasingly overrides aim.
  const mistimed = Math.max(
    0,
    Math.min(
      1,
      (Math.abs(timingError) - GOOD_WINDOW) / (CONTACT_WINDOW - GOOD_WINDOW),
    ),
  );
  const spread = -Math.max(-1, Math.min(1, timingError / 0.36)) * 0.23;
  const direction =
    aim * 0.68 * (1 - mistimed) +
    spread -
    Math.sign(timingError) * mistimed * 0.47 +
    location.x * 0.06;
  const speed =
    power *
    (1 - Math.abs(aim * 0.25 - location.x) * 0.06) *
    (1 - Math.min(1, Math.abs(timingError) / 0.36) * 0.025);
  const horizontal = speed * Math.cos((angle * Math.PI) / 180);
  return {
    x: Math.sin(direction) * horizontal,
    y: speed * Math.sin((angle * Math.PI) / 180),
    z: Math.cos(direction) * horizontal,
  };
}

/** Choose the launch once, then let ordinary gravity, drag and collisions run.
 * Accuracy improves continuously, including inside the forgiving Perfect label.
 * No random roll: repeating the same aim and timing produces the same shot.
 */
export function targetedExitVelocity(
  quality: Quality,
  aim: number,
  location: { x: number; y: number },
  timingError: number,
  position: Vec3,
  targets: readonly Target[] = TARGETS,
): Vec3 {
  const natural = exitVelocity(quality, aim, location, timingError);
  if (
    Math.abs(timingError) >= GOOD_WINDOW ||
    quality === "Miss" ||
    quality === "Too early"
  )
    return natural;

  const direction = Math.atan2(natural.x, natural.z);
  let closest: Target | undefined;
  let bestAngle = 0.22; // Assist nearby targets while preserving the player's aim.
  for (const target of targets) {
    const angle = Math.abs(
      Math.atan2(
        target.position.x - position.x,
        target.position.z - position.z,
      ) - direction,
    );
    if (angle < bestAngle) {
      closest = target;
      bestAngle = angle;
    }
  }
  if (!closest) return natural;

  // Meet the target on the descending arc, clearing the outfield fence.
  // The toilet's aim point is its water surface inside the open bowl.
  const destination = { ...closest.position };
  if (closest.id === "toilet") {
    destination.y += 0.5;
    destination.z -= 1;
  }
  const seconds = 2.8;
  const drag = 0.055;
  const travel = (1 - Math.exp(-drag * seconds)) / drag;
  const assisted = {
    x: (destination.x - position.x) / travel,
    y:
      (destination.y - position.y + (13.8 / drag) * (seconds - travel)) /
      travel,
    z: (destination.z - position.z) / travel,
  };
  const precision = 1 - Math.abs(timingError) / GOOD_WINDOW;
  const assistance = precision * precision * (3 - 2 * precision);
  return {
    x: natural.x + (assisted.x - natural.x) * assistance,
    y: natural.y + (assisted.y - natural.y) * assistance,
    z: natural.z + (assisted.z - natural.z) * assistance,
  };
}
export class Controls {
  aim = 0;
  left = false;
  right = false;
  constructor(
    private canvas: HTMLCanvasElement,
    actions: {
      swing: () => void;
      pause: () => void;
      restart: () => void;
      start: () => void;
    },
  ) {
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
      if (e.repeat && !e.code.startsWith("Arrow")) return;
      if (e.code === "Space") actions.swing();
      if (e.code === "ArrowLeft") this.left = true;
      if (e.code === "ArrowRight") this.right = true;
      if (e.code === "KeyP" || e.code === "Escape") actions.pause();
      if (e.code === "KeyR") actions.restart();
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "ArrowLeft") this.left = false;
      if (e.code === "ArrowRight") this.right = false;
    });
    window.addEventListener("blur", () => {
      this.left = false;
      this.right = false;
    });
    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") this.setAim(e.clientX);
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse") this.setAim(e.clientX);
      actions.swing();
    });
    document
      .querySelector("#touch-swing")
      ?.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        actions.swing();
      });
    const pad = document.querySelector<HTMLInputElement>("#touch-aim");
    pad?.addEventListener("input", () => {
      this.aim = Number(pad.value);
    });
  }
  setAim(x: number) {
    const r = this.canvas.getBoundingClientRect();
    this.aim = Math.max(-1, Math.min(1, (0.5 - (x - r.left) / r.width) * 2));
  }
  update(dt: number) {
    this.aim = Math.max(
      -1,
      Math.min(
        1,
        this.aim + (Number(this.left) - Number(this.right)) * dt * 0.95,
      ),
    );
  }
}

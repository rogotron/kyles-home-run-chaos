import * as THREE from "three";
import type { Character } from "./models";
import type { Vec3 } from "./types";

export const BATTER_STANCE = {
  x: -1.35,
  y: 0,
  z: 0,
  yaw: -Math.PI / 2,
  scale: 1.12,
};
// Pitcher-facing side of the plate (whose front edge is z ≈ 0.53).
// At the nominal pitch speed, this is about 100 ms before the old z = 0.25.
export const CONTACT_Z = 1.4;
export const BAT_CENTER_Y = 0.65;
const restPosition = new THREE.Vector3(0.14, -0.37, 0);
const restRotation = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-0.6, 0, -0.65),
);

/** Keep both planted feet fixed; aim the visible barrel through the assisted contact point. */
export function poseSwing(
  batter: Character,
  progress: number | null,
  contact: Vec3,
) {
  const { arm, bat } = batter;
  if (!bat) return;
  arm.quaternion.identity();
  arm.scale.setScalar(1);
  bat.position.copy(restPosition);
  bat.quaternion.copy(restRotation);
  bat.scale.setScalar(1);
  if (progress === null) return;

  batter.group.updateMatrixWorld(true);
  const shoulder = arm.getWorldPosition(new THREE.Vector3());
  const direction = new THREE.Vector3(contact.x, contact.y, contact.z)
    .sub(shoulder)
    .normalize()
    .lerp(new THREE.Vector3(1, 0.15, 0.15).normalize(), 0.25)
    .normalize();
  const handle = new THREE.Vector3(
    contact.x,
    contact.y,
    contact.z,
  ).addScaledVector(direction, -1.1 * BATTER_STANCE.scale);
  const turn = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    -Math.sin(progress * Math.PI) * 1.5,
  );
  handle.sub(shoulder).applyQuaternion(turn).add(shoulder);
  direction.applyQuaternion(turn);
  const localHand = arm.parent!.worldToLocal(handle.clone()).sub(arm.position);
  const handRest = new THREE.Vector3(0.12, -0.42, 0);
  arm.quaternion.setFromUnitVectors(
    handRest.clone().normalize(),
    localHand.clone().normalize(),
  );
  arm.scale.setScalar(localHand.length() / handRest.length());
  arm.updateWorldMatrix(true, false);
  bat.position.copy(arm.worldToLocal(handle.clone()));
  bat.quaternion
    .copy(arm.getWorldQuaternion(new THREE.Quaternion()).invert())
    .multiply(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction,
      ),
    );
  const parentScale = arm.getWorldScale(new THREE.Vector3()).x;
  bat.scale.setScalar(BATTER_STANCE.scale / parentScale);
  // Settle back into the original ready pose at the end of the follow-through.
  const recovery = THREE.MathUtils.smoothstep(progress, 0.65, 1);
  arm.quaternion.slerp(new THREE.Quaternion(), recovery);
  arm.scale.lerp(new THREE.Vector3(1, 1, 1), recovery);
  bat.position.lerp(restPosition, recovery);
  bat.quaternion.slerp(restRotation, recovery);
  // Keep the bat at its fixed world size so the capsule matches during recovery too.
  bat.scale.setScalar(1 / arm.scale.x);
  batter.group.updateMatrixWorld(true);
}

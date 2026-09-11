import type { Quality, TargetId } from "./types";
import { TARGETS } from "./types";
// Seconds from the visible contact point in front of home plate.
// Share the outer limit with the pitch lifecycle so late attempts remain playable.
export const CONTACT_WINDOW = 0.6;
export const GOOD_WINDOW = 0.4;
export const PERFECT_WINDOW = 0.2;
const TIMING_EPSILON = 1e-9;
export function classifySwing(error: number): Quality {
  if (error < -CONTACT_WINDOW - TIMING_EPSILON) return "Too early";
  if (error > CONTACT_WINDOW + TIMING_EPSILON) return "Miss";
  if (Math.abs(error) <= PERFECT_WINDOW + TIMING_EPSILON) return "Perfect";
  if (Math.abs(error) <= GOOD_WINDOW + TIMING_EPSILON) return "Good";
  return error < 0 ? "Early" : "Late";
}
export const streakMultiplier = (streak: number) =>
  1 + Math.min(4, Math.max(0, streak - 1)) * 0.5;
export function scoreHit(
  distance: number,
  homeRun: boolean,
  previousStreak: number,
  golden: boolean,
  target: TargetId | null,
  fair = true,
) {
  const streak = homeRun ? previousStreak + 1 : 0;
  const multiplier = streakMultiplier(streak);
  const distancePoints = fair ? Math.round(distance) * 5 : 0;
  const hrBonus = homeRun ? 1000 : 0;
  const targetBonus = TARGETS.find((t) => t.id === target)?.bonus ?? 0;
  const goalMultiplier = target === "goal" ? 3 : 1;
  const goldenMultiplier = golden ? 2 : 1;
  const points = Math.round(
    (distancePoints + hrBonus + targetBonus) *
      multiplier *
      goalMultiplier *
      goldenMultiplier,
  );
  const parts = [`${distancePoints.toLocaleString()} distance`];
  if (homeRun) parts.push("1,000 home run");
  if (targetBonus) parts.push(`${targetBonus.toLocaleString()} target`);
  return {
    points,
    streak,
    multiplier,
    description: `${parts.join(" + ")}${multiplier > 1 ? ` × ${multiplier} streak` : ""}${target === "goal" ? " × 3 goal" : ""}${golden ? " × 2 golden" : ""}`,
  };
}

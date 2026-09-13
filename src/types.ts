export type Mode = "solo" | "versus";
export type Phase = "menu" | "playing" | "handoff" | "results";
export type PitchState = "ready" | "pitching" | "flight" | "result";
export type Quality =
  | "Too early"
  | "Early"
  | "Good"
  | "Perfect"
  | "Late"
  | "Miss";
export type TargetId =
  | "goal"
  | "dinosaur"
  | "ufo"
  | "icecream"
  | "toilet"
  | "scoreboard"
  | "lights"
  | "baseball"
  | "mascot"
  | "sock";
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Target {
  id: TargetId;
  name: string;
  label: string;
  bonus: number;
  color: string;
  position: Vec3;
  half: Vec3;
  message: string;
  permanent?: boolean;
}
export const TARGETS: Target[] = [
  {
    id: "icecream",
    name: "Ice cream truck",
    label: "+2,000",
    bonus: 2000,
    color: "#8de5df",
    position: { x: -57, y: 6, z: 84 },
    half: { x: 7, y: 6, z: 4 },
    message: "ICE CREAM PARTY!",
  },
  {
    id: "goal",
    name: "Soccer goal",
    label: "TRIPLE POINTS",
    bonus: 0,
    color: "#a8f178",
    position: { x: -29, y: 7, z: 83 },
    half: { x: 10, y: 7, z: 2 },
    message: "GOOOAAAL!",
  },
  {
    id: "ufo",
    name: "UFO",
    label: "+3,000",
    bonus: 3000,
    color: "#a899ff",
    position: { x: 0, y: 25, z: 91 },
    half: { x: 7, y: 3, z: 5 },
    message: "UFO HIT!",
  },
  {
    id: "dinosaur",
    name: "Hungry dino",
    label: "+4,000",
    bonus: 4000,
    color: "#80e7b1",
    position: { x: 34, y: 16, z: 83 },
    half: { x: 5.5, y: 4, z: 5 },
    message: "DINO CHOMP!",
  },
  {
    id: "toilet",
    name: "Chaos toilet",
    label: "+5,000",
    bonus: 5000,
    color: "#ffbad9",
    position: { x: 17, y: 6, z: 98 },
    half: { x: 5, y: 6, z: 4 },
    message: "FLUSHED IT!",
  },
  {
    id: "scoreboard",
    name: "Scoreboard",
    label: "+4,000",
    bonus: 4000,
    color: "#ffe17d",
    position: { x: -47, y: 25, z: 110 },
    half: { x: 14, y: 7, z: 1 },
    message: "SCOREBOARD SMASH!",
  },
  {
    id: "lights",
    name: "Light tower",
    label: "+1,500",
    bonus: 1500,
    color: "#a9f9ff",
    position: { x: 46, y: 27, z: 90 },
    half: { x: 6, y: 3, z: 0.7 },
    message: "LIGHTS OUT!",
  },
  {
    id: "baseball",
    name: "Inflatable baseball",
    label: "+1,500",
    bonus: 1500,
    color: "#ff9ec9",
    position: { x: -52, y: 24, z: 66 },
    half: { x: 6, y: 6, z: 6 },
    message: "BASEBALL POP!",
    permanent: true,
  },
  {
    id: "mascot",
    name: "Wobbly mascot",
    label: "+2,000",
    bonus: 2000,
    color: "#a5d0ff",
    position: { x: 55, y: 14, z: 94 },
    half: { x: 5, y: 8, z: 4 },
    message: "MASCOT WOBBLE!",
  },
  {
    id: "sock",
    name: "Inflatable sock",
    label: "+2,500",
    bonus: 2500,
    color: "#f58192",
    position: { x: -7, y: 14, z: 82 },
    half: { x: 8, y: 7, z: 3.5 },
    message: "SOCK IT TO ME!",
    permanent: true,
  },
];
export interface RoundStats {
  player: string;
  score: number;
  homeRuns: number;
  streak: number;
  longest: number;
  multiplier: number;
  bestStreak: number;
}
export interface HitSummary {
  pitch: number;
  message: string;
  quality: Quality;
  distance: number;
  points: number;
  calculation: string;
  golden: boolean;
}
export interface Records {
  highScore: number;
  longest: number;
}
export const freshStats = (player: string): RoundStats => ({
  player,
  score: 0,
  homeRuns: 0,
  streak: 0,
  longest: 0,
  multiplier: 1,
  bestStreak: 0,
});

import { freshStats } from "./types";
import type {
  Mode,
  Phase,
  PitchState,
  Quality,
  Records,
  RoundStats,
  TargetId,
  HitSummary,
} from "./types";
export const STORAGE_KEY = "kyles-home-run-chaos.records.v1";
export class GameState {
  mode: Mode = "solo";
  phase: Phase = "menu";
  pitchState: PitchState = "ready";
  remaining = 60;
  readonly totalPitches = 10;
  pitchNumber = 0;
  hits: HitSummary[] = [];
  paused = false;
  stats = freshStats("Kyle");
  rounds: RoundStats[] = [];
  swingResult: Quality | null = null;
  lastTarget: TargetId | null = null;
  records: Records = { highScore: 0, longest: 0 };
  constructor() {
    try {
      const r = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      this.records = {
        highScore: Math.max(0, Number(r.highScore) || 0),
        longest: Math.max(0, Number(r.longest) || 0),
      };
    } catch {
      /* Private browsing can disable persistence. */
    }
  }
  get golden() {
    return this.pitchNumber >= 9 && this.phase === "playing";
  }
  beginPitch() {
    if (
      this.phase !== "playing" ||
      this.paused ||
      this.pitchNumber >= this.totalPitches
    )
      return false;
    this.pitchNumber++;
    return true;
  }
  recordHit(hit: Omit<HitSummary, "pitch">) {
    if (!this.hits.some((h) => h.pitch === this.pitchNumber))
      this.hits.push({ ...hit, pitch: this.pitchNumber });
  }
  start(mode: Mode, player = "Kyle") {
    this.mode = mode;
    this.phase = "playing";
    this.stats = freshStats(player);
    this.remaining = 60;
    this.pitchNumber = 0;
    this.hits = [];
    this.paused = false;
    this.pitchState = "ready";
    this.swingResult = null;
    this.lastTarget = null;
    if (player === "Kyle") this.rounds = [];
  }
  tick(dt: number) {
    if (this.phase === "playing" && !this.paused)
      this.remaining = Math.max(0, this.remaining - dt);
  }
  finish() {
    if (this.phase !== "playing") return;
    this.rounds.push({ ...this.stats });
    this.records.highScore = Math.max(this.records.highScore, this.stats.score);
    this.records.longest = Math.max(this.records.longest, this.stats.longest);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.records));
    } catch {
      /* A round is still playable without storage. */
    }
    this.phase =
      this.mode === "versus" && this.stats.player === "Kyle"
        ? "handoff"
        : "results";
    this.paused = false;
  }
}

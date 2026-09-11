import { describe, expect, it } from "vitest";
import { classifySwing, scoreHit, streakMultiplier } from "../src/scoring";
import { exitVelocity } from "../src/batting";
import { GameState, STORAGE_KEY } from "../src/state";
import { Pitching } from "../src/pitching";
describe("forgiving contact timing", () => {
  it.each([
    [-0.601, "Too early"],
    [-0.6, "Early"],
    [-0.5, "Early"],
    [-0.401, "Early"],
    [-0.4, "Good"],
    [-0.201, "Good"],
    [-0.2, "Perfect"],
    [-0.09, "Perfect"],
    [0, "Perfect"],
    [0.09, "Perfect"],
    [0.2, "Perfect"],
    [0.201, "Good"],
    [0.4, "Good"],
    [0.401, "Late"],
    [0.5, "Late"],
    [0.6, "Late"],
    [0.601, "Miss"],
  ])("classifies %s seconds as %s", (error, quality) =>
    expect(classifySwing(Number(error))).toBe(quality),
  );
  it("makes perfect contact substantially more powerful", () => {
    const location = { x: 0, y: 1.65 };
    const perfect = exitVelocity("Perfect", 0, location),
      good = exitVelocity("Good", 0, location);
    expect(perfect.y).toBeGreaterThan(good.y * 1.2);
    expect(Math.hypot(perfect.y, perfect.z)).toBeGreaterThan(
      Math.hypot(good.y, good.z),
    );
  });
  it("aim and pitch location influence the launch", () => {
    expect(exitVelocity("Good", 1, { x: 0, y: 1.6 }).x).toBeGreaterThan(10);
    expect(exitVelocity("Good", -1, { x: 0, y: 1.6 }).x).toBeLessThan(-10);
    expect(exitVelocity("Good", 0, { x: 0.4, y: 1.9 })).not.toEqual(
      exitVelocity("Good", 0, { x: 0, y: 1.6 }),
    );
  });
});
describe("simple, transparent scoring", () => {
  it("awards fair distance points", () =>
    expect(scoreHit(200, false, 0, false, null).points).toBe(1000));
  it("adds the home run bonus", () =>
    expect(scoreHit(300, true, 0, false, null).points).toBe(2500));
  it("combines streak, goal and gold exactly once", () =>
    expect(scoreHit(300, true, 1, true, "goal").points).toBe(22500));
  it("adds a target bonus before multipliers", () =>
    expect(scoreHit(300, true, 0, false, "toilet").points).toBe(7500));
  it("resets the streak for a ground ball", () => {
    const r = scoreHit(70, false, 4, false, null);
    expect(r.streak).toBe(0);
    expect(r.multiplier).toBe(1);
  });
  it("caps the streak multiplier", () => expect(streakMultiplier(50)).toBe(3));
  it("does not award distance points for foul balls", () =>
    expect(scoreHit(300, false, 0, false, null, false).points).toBe(0));
});
describe("round and persistence rules", () => {
  it("pauses the timer and clamps it to zero", () => {
    const s = new GameState();
    s.start("solo");
    s.tick(4);
    s.paused = true;
    s.tick(10);
    expect(s.remaining).toBe(56);
    s.paused = false;
    s.tick(80);
    expect(s.remaining).toBe(0);
  });
  it("counts ten pitches, makes the last two golden, and rejects an eleventh", () => {
    const s = new GameState();
    s.start("solo");
    for (let i = 1; i <= 10; i++) {
      expect(s.beginPitch()).toBe(true);
      expect(s.pitchNumber).toBe(i);
      expect(s.golden).toBe(i >= 9);
    }
    expect(s.beginPitch()).toBe(false);
    expect(s.pitchNumber).toBe(10);
    s.start("solo");
    expect(s.pitchNumber).toBe(0);
    expect(s.golden).toBe(false);
  });
  it("does not consume pitches while paused or end the round on an expired clock", () => {
    const s = new GameState();
    s.start("solo");
    s.paused = true;
    expect(s.beginPitch()).toBe(false);
    s.paused = false;
    s.tick(600);
    expect(s.phase).toBe("playing");
    expect(s.pitchNumber).toBe(0);
  });
  it("records only one outcome per pitch", () => {
    const s = new GameState();
    s.start("solo");
    s.beginPitch();
    const h = {
      message: "MISS",
      quality: "Miss" as const,
      distance: 0,
      points: 0,
      calculation: "0 points",
      golden: false,
    };
    s.recordHit(h);
    s.recordHit(h);
    expect(s.hits).toHaveLength(1);
  });
  it("hands the bat to Dad, then ends the match", () => {
    const s = new GameState();
    s.start("versus");
    s.finish();
    expect(s.phase).toBe("handoff");
    s.start("versus", "Dad");
    s.finish();
    expect(s.phase).toBe("results");
    expect(s.rounds.map((r) => r.player)).toEqual(["Kyle", "Dad"]);
  });
  it("saves records and tolerates unavailable storage", () => {
    const data = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => data.get(key),
        setItem: (key: string, value: string) => data.set(key, value),
      },
    });
    const s = new GameState();
    s.start("solo");
    s.stats.score = 9000;
    s.stats.longest = 410;
    s.finish();
    expect(JSON.parse(data.get(STORAGE_KEY)!)).toEqual({
      highScore: 9000,
      longest: 410,
    });
    expect(new GameState().records.highScore).toBe(9000);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  it("finishes a round once", () => {
    const s = new GameState();
    s.start("solo");
    s.finish();
    s.finish();
    expect(s.rounds).toHaveLength(1);
  });
});
describe("pitching", () => {
  it("reaches the strike zone at the intended contact time", () => {
    const p = new Pitching();
    p.start(true);
    p.elapsed = p.contactTime;
    expect(p.position().z).toBeCloseTo(1.4);
    expect(p.position().y).toBeCloseTo(1.65);
    expect(p.error).toBe(0);
  });
});

describe("timing-driven spray and power", () => {
  it("sends early opposite to left, pulls late right, and rewards the sweet spot at the same aim", () => {
    const p = { x: 0, y: 1.65 };
    const early = exitVelocity("Early", 0, p, -0.27),
      perfect = exitVelocity("Perfect", 0, p, 0),
      late = exitVelocity("Late", 0, p, 0.27);
    expect(early.x).toBeGreaterThan(4);
    expect(late.x).toBeLessThan(-4);
    expect(perfect.x).toBe(0);
    expect(Math.hypot(perfect.x, perfect.y, perfect.z)).toBeGreaterThan(
      Math.hypot(early.x, early.y, early.z) * 1.3,
    );
  });
  it("uses timing continuously even within the good-contact window", () => {
    const p = { x: 0, y: 1.65 };
    expect(exitVelocity("Good", 0, p, -0.12).x).toBeGreaterThan(0);
    expect(exitVelocity("Good", 0, p, 0.12).x).toBeLessThan(0);
  });
});

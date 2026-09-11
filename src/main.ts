import "./style.css";
import { Rendering } from "./rendering";
import { initPhysics, estimateLandingDistance } from "./physics";
import type { Physics } from "./physics";
import { GameState } from "./state";
import { Pitching } from "./pitching";
import { Controls, targetedExitVelocity } from "./batting";
import { TARGET_REACTION_SECONDS } from "./target-shapes";
import { CONTACT_Z, BAT_CENTER_Y } from "./batter";
import { classifySwing, scoreHit, CONTACT_WINDOW } from "./scoring";
import { GameAudio } from "./audio";
import { UI } from "./ui";
import { TARGETS, freshStats } from "./types";
import type { Mode, Quality, TargetId, Vec3 } from "./types";
import { loadVisualAssets, type VisualAssets } from "./visual-assets";

export class Game {
  state = new GameState();
  pitching = new Pitching();
  audio = new GameAudio();
  view: Rendering;
  ui: UI;
  controls: Controls;
  wait = 0.9;
  flightAge = 0;
  hitGolden = false;
  hitPerfect = false;
  homeRun = false;
  fair = true;
  distance = 0;
  target: TargetId | null = null;
  slowMotion = 0;
  frame = 0;
  last = 0;
  landing = false;
  targetReaction = 0;
  targetImpact: Vec3 = { x: 0, y: 0, z: 0 };
  estimatedDistance = 0;
  timingErrorMs: number | null = null;
  contactFramePending = false;
  ready: Promise<void>;
  constructor(
    public physics: Physics,
    assets: VisualAssets = {},
  ) {
    const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
    this.view = new Rendering(canvas, assets);
    this.ui = new UI({
      start: (m) => this.start(m),
      pause: () => this.pause(),
      restart: () => this.restart(),
      home: () => this.home(),
      sound: () => this.audio.toggle(),
    });
    this.controls = new Controls(canvas, {
      swing: () => this.swing(),
      pause: () => this.pause(),
      restart: () => this.restart(),
      start: () => this.start(this.ui.mode),
    });
    document.addEventListener("visibilitychange", () => {
      if (
        document.hidden &&
        this.state.phase === "playing" &&
        !this.state.paused
      )
        this.pause();
    });
    window.addEventListener("blur", () => {
      if (this.state.phase === "playing" && !this.state.paused) this.pause();
    });
    // Warm shaders and shadows while the loading screen still covers the canvas.
    // Synchronous compilation also allows startup with a suspended animation clock.
    this.ready = Promise.resolve().then(() => {
      this.view.renderer.compile(this.view.scene, this.view.camera);
      this.view.renderer.shadowMap.needsUpdate = true;
      this.view.renderer.render(this.view.scene, this.view.camera);
      this.last = performance.now();
      this.frame = requestAnimationFrame((t) => this.loop(t));
      if (import.meta.env.DEV) this.exposeDevelopmentControls();
    });
  }
  start(mode: Mode) {
    this.audio.unlock();
    const player = this.state.phase === "handoff" ? "Dad" : "Kyle";
    this.state.start(mode, player);
    this.view.resetTargets(true);
    this.physics.resetTargets(true);
    this.ui.mode = mode;
    this.resetBall();
    this.wait = 1.1;
    this.ui.announce(
      player === "Dad" ? "Your turn, Dad!" : "Let’s make chaos!",
      "10 PITCHES · SWING FOR THE FENCES",
      1.2,
    );
  }
  resetBall() {
    this.targetReaction = 0;
    this.view.ball.scale.setScalar(1);
    this.view.resetTargets();
    this.physics.resetTargets();
    this.physics.hideBall();
    this.view.effects.clearTrail();
    this.state.pitchState = "ready";
    this.distance = 0;
    this.target = null;
    this.homeRun = false;
    this.flightAge = 0;
    this.slowMotion = 0;
    this.landing = false;
    this.wait = 0.85;
    this.contactFramePending = false;
    this.pitchingReset();
  }
  pitchingReset() {
    this.pitching.swung = false;
  }
  restart() {
    if (this.state.phase !== "playing") return;
    const player = this.state.stats.player;
    const previous = [...this.state.rounds];
    this.state.start(this.state.mode, player);
    this.view.resetTargets(true);
    this.physics.resetTargets(true);
    if (player === "Dad") this.state.rounds = previous;
    this.resetBall();
    this.ui.announce("Fresh round!", "YOU’VE GOT THIS", 1);
  }
  home() {
    this.view.resetTargets(true);
    this.physics.resetTargets(true);
    this.state.phase = "menu";
    this.state.paused = false;
    this.state.remaining = 60;
    this.state.pitchNumber = 0;
    this.state.hits = [];
    this.state.stats = freshStats("Kyle");
    this.state.rounds = [];
    this.state.swingResult = null;
    this.state.lastTarget = null;
    this.resetBall();
    this.ui.toastTime = 0;
  }
  pause() {
    if (this.state.phase === "playing") {
      this.state.paused = !this.state.paused;
      this.last = performance.now();
    }
  }
  newPitch(predictable = false) {
    if (this.state.phase !== "playing" || this.state.paused) return false;
    // Predictable pitches can replace a pitch already on its way, without consuming another.
    if (!(predictable && this.state.pitchState === "pitching")) {
      if (!this.state.beginPitch()) return false;
    }
    this.physics.hideBall();
    this.view.effects.clearTrail();
    this.targetReaction = 0;
    this.view.ball.scale.setScalar(1);
    this.view.resetTargets();
    this.physics.resetTargets();
    this.pitching.start(predictable);
    this.contactFramePending = false;
    if (predictable) this.last = performance.now();
    this.state.pitchState = "pitching";
    this.state.swingResult = null;
    this.target = null;
    this.homeRun = false;
    this.distance = 0;
    this.hitGolden = this.state.golden;
    this.hitPerfect = false;
    this.audio.play("pitch");
    if (this.state.golden) this.audio.play("countdown");
    return true;
  }
  swing(inputTime = performance.now()) {
    this.audio.unlock();
    if (
      this.state.phase === "menu" ||
      this.state.phase === "results" ||
      this.state.phase === "handoff"
    ) {
      this.start(this.ui.mode);
      return;
    }
    if (this.state.paused) return;
    if (this.state.pitchState !== "pitching" || this.pitching.swung) {
      if (this.state.pitchState === "ready") {
        this.view.swing();
        this.audio.play("swing");
      }
      return;
    }
    // Include time since the last rendered pitch frame. Resolve in this input
    // handler; the animation never adds a wind-up delay to the player's timing.
    this.pitching.elapsed += Math.min(
      0.1,
      Math.max(0, (inputTime - this.last) / 1000),
    );
    this.pitching.swung = true;
    this.audio.play("swing");
    const quality = classifySwing(this.pitching.error);
    this.timingErrorMs = this.pitching.error * 1000;
    this.ui.showTiming(this.timingErrorMs, quality);
    this.state.swingResult = quality;
    if (quality === "Too early" || quality === "Miss") {
      this.view.swing();
      this.miss(quality);
      return;
    }
    const position = this.pitching.position();
    const targets = TARGETS.filter(
      (target) => !this.physics.damagedTargets.has(target.id),
    ).map((target) => {
      if (target.id !== "ufo") return target;
      // Lead the moving UFO by the flight time, including perfect-hit slow motion.
      const arrival =
        this.view.elapsed + 2.8 / 1.7 + (quality === "Perfect" ? 0.24 : 0);
      return {
        ...target,
        position: {
          x: Math.sin(arrival * 0.24) * 13,
          y: 25 + Math.sin(arrival) * 1.2,
          z: target.position.z,
        },
      };
    });
    const v = targetedExitVelocity(
      quality,
      this.controls.aim,
      this.pitching.location,
      this.pitching.error,
      position,
      targets,
    );
    // Use the incoming ball's actual position, including off-center timing,
    // instead of teleporting it back to a fixed point over the plate.
    this.beginFlight(position, v, quality);
  }
  beginFlight(p: Vec3, v: Vec3, quality: Quality) {
    this.view.swing(p);
    this.syncBat();
    this.state.pitchState = "flight";
    this.state.swingResult = quality;
    this.physics.launch(p, v);
    this.contactFramePending = true;
    this.view.effects.clearTrail();
    this.flightAge = 0;
    this.distance = 0;
    this.target = null;
    this.state.lastTarget = null;
    this.homeRun = false;
    this.fair = Math.abs(Math.atan2(v.x, v.z)) <= Math.PI / 4;
    this.hitPerfect = quality === "Perfect";
    this.slowMotion = this.hitPerfect ? 0.15 : 0;
    this.landing = false;
    this.audio.play(this.hitPerfect ? "perfect" : "contact");
    this.view.shake = this.hitPerfect ? 1.1 : 0.45;
    this.view.crowdReact(this.hitPerfect ? "crushed" : "contact");
    this.view.effects.burst(
      p,
      this.hitPerfect ? "#ffe387" : "#e0ffdc",
      this.hitPerfect ? 90 : 35,
      this.hitPerfect ? 14 : 8,
    );
    this.ui.announce(
      this.hitPerfect
        ? "PERFECT CONTACT"
        : this.pitching.error < 0
          ? "EARLY CONTACT"
          : "LATE CONTACT",
      "",
      0.85,
    );
  }
  miss(quality: Quality = "Miss") {
    this.state.swingResult = quality;
    this.state.stats.streak = 0;
    this.state.stats.multiplier = 1;
    this.state.pitchState = "result";
    this.wait = 1.25;
    const message = quality === "Too early" ? "TOO EARLY!" : "SWING AND A MISS";
    this.ui.announce(message, "", this.wait);
    this.state.recordHit({
      message,
      quality,
      distance: 0,
      points: 0,
      calculation: "No contact · 0 points",
      golden: this.hitGolden,
    });
    this.physics.hideBall();
  }
  collision(tag: string) {
    if (this.state.pitchState !== "flight" || this.landing) return;
    if (this.target) return; // The current ball has already claimed its target bonus.
    if (TARGETS.some((t) => t.id === tag)) {
      const id = tag as TargetId;
      const target = TARGETS.find((t) => t.id === id)!;
      this.target = id;
      this.state.lastTarget = id;
      this.targetImpact = { ...this.physics.position() };
      this.targetReaction = TARGET_REACTION_SECONDS;
      this.physics.captureBall(this.targetImpact);
      if (target.permanent) this.physics.damageTarget(id);
      this.view.react(id);
      if (id === "toilet") this.view.crowdReact("toilet");
      if (id === "lights") this.view.crowdReact("lights");
      this.audio.play(id);
      this.audio.play("crowd");
      this.view.shake = 0.45;
      this.view.effects.clearTrail();
      this.view.effects.burst(
        this.targetImpact,
        target.color,
        id === "lights" ? 45 : 32,
        5,
      );
      this.ui.announce(
        `${target.message} ${target.label}`,
        "",
        TARGET_REACTION_SECONDS + 0.5,
      );
      return;
    }
    if (tag === "ground" && this.flightAge > 0.18) this.settle();
    if (
      tag === "wall" ||
      tag === "goalpost" ||
      tag === "sign" ||
      tag === "stadium"
    ) {
      this.audio.play("contact");
      this.view.effects.burst(this.physics.position(), "#ffe3a8", 30, 8);
      if (tag === "wall" && !this.homeRun)
        this.ui.announce(
          "OFF THE WALL!",
          "SO CLOSE! GIVE IT ANOTHER RIP.",
          0.8,
        );
      if (tag === "stadium" || tag === "sign") this.settle();
    }
  }
  settle() {
    if (this.landing || this.state.pitchState !== "flight") return;
    this.landing = true;
    const p = this.physics.position();
    this.distance = Math.max(
      this.distance,
      Math.round(Math.hypot(p.x, p.z) * 3.28084),
    );
    const result = scoreHit(
      this.distance,
      this.homeRun,
      this.state.stats.streak,
      this.hitGolden,
      this.target,
      this.fair,
    );
    const s = this.state.stats;
    s.score += result.points;
    s.streak = result.streak;
    s.multiplier = result.multiplier;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    if (this.homeRun) {
      s.homeRuns++;
      s.longest = Math.max(s.longest, this.distance);
    }
    this.state.pitchState = "result";
    this.wait = this.target ? 0.5 : 1.4;
    const title = this.target
      ? (() => {
          const t = TARGETS.find((t) => t.id === this.target)!;
          return `${t.message} ${t.label}`;
        })()
      : this.homeRun
        ? "HOME RUN!"
        : this.fair
          ? "NICE HIT!"
          : "FOUL BALL";
    const message =
      this.target || !this.fair ? title : `${title} ${this.distance} FT`;
    this.ui.announce(message, "", this.wait);
    this.state.recordHit({
      message,
      quality: this.state.swingResult!,
      distance: this.distance,
      points: result.points,
      calculation: result.description,
      golden: this.hitGolden,
    });
    if (!this.target && !this.homeRun) this.audio.play("contact");
    this.view.effects.burst(p, this.hitGolden ? "#ffd760" : "#c5f59f", 50, 9);
  }
  updateTargetReaction(dt: number) {
    this.targetReaction = Math.max(0, this.targetReaction - dt);
    const age = TARGET_REACTION_SECONDS - this.targetReaction;
    const p = this.targetImpact;
    let ball: Vec3;
    if (this.target === "toilet") {
      const toilet = TARGETS.find((t) => t.id === "toilet")!.position;
      const entrance = Math.min(1, age / 0.28);
      const spin = Math.max(0, age - 0.28);
      const a0 = Math.atan2(p.z - toilet.z + 1, p.x - toilet.x);
      const radius = Math.max(0.06, 3.2 * (1 - spin / 1.4));
      const swirl = {
        x: toilet.x + Math.cos(a0 - spin * 10) * radius,
        y: 6.65 - Math.max(0, spin - 1.15) * 4,
        z: toilet.z - 1 + Math.sin(a0 - spin * 10) * radius * 1.08,
      };
      ball = {
        x: p.x + (swirl.x - p.x) * entrance,
        y: p.y + (swirl.y - p.y) * entrance,
        z: p.z + (swirl.z - p.z) * entrance,
      };
      this.view.ball.scale.setScalar(
        Math.max(0.08, 1 - Math.max(0, age - 1.5) / 0.65),
      );
      this.view.ball.rotation.z += dt * 22;
    } else if (this.target === "ufo") {
      ball = { x: p.x, y: p.y + Math.min(age, 0.6) * 6, z: p.z };
    } else {
      ball = {
        x: p.x + Math.sin(age * 2) * 0.7,
        y: Math.max(0.4, p.y + age * 1.5 - age * age * 1.5),
        z: p.z - age * 1.8,
      };
    }
    this.physics.captureBall(ball);
    if (this.targetReaction <= 0) this.settle();
  }
  finish() {
    this.state.finish();
    this.audio.play("end");
    this.ui.toastTime = 0;
    this.physics.hideBall();
  }
  update(dt: number, wallDt = dt) {
    const s = this.state;
    if (s.phase !== "playing" || s.paused) return;
    this.controls.update(dt);
    s.tick(wallDt);
    for (const [id, t] of this.view.targets) {
      if (id === "ufo")
        this.physics.moveTarget(id, {
          x: t.group.position.x,
          y: t.group.position.y,
          z: t.group.position.z,
        });
    }
    if (s.pitchState === "ready") {
      this.wait -= dt;
      if (s.pitchNumber >= s.totalPitches) {
        this.finish();
        return;
      }
      if (this.wait <= 0) this.newPitch();
    }
    if (s.pitchState === "pitching") {
      this.pitching.elapsed += dt;
      const p = this.pitching.position();
      this.physics.pitch(p);
      this.physics.step(dt, () => {});
      if (this.pitching.error > CONTACT_WINDOW + 1e-9) {
        this.miss("Miss");
      }
    } else if (s.pitchState === "flight") {
      if (this.targetReaction > 0) {
        this.updateTargetReaction(dt);
        this.audio.update(dt, true, s.golden);
        return;
      }
      this.flightAge += dt;
      this.slowMotion = Math.max(0, this.slowMotion - dt);
      const simSpeed = this.slowMotion > 0 ? 0.25 : 1.7;
      this.physics.step(dt * simSpeed, (tag) => this.collision(tag));
      const p = this.physics.position();
      const d = Math.hypot(p.x, p.z);
      this.distance = Math.max(this.distance, Math.round(d * 3.28084));
      this.estimatedDistance = estimateLandingDistance(
        p,
        this.physics.velocity(),
      );
      if (!this.homeRun && this.fair && d > 72.5 && p.y > 4.1) {
        this.homeRun = true;
        this.audio.play("homerun");
        if (!this.hitPerfect) this.view.crowdReact("homeRun");
        this.view.effects.burst(
          p,
          this.hitPerfect ? "#ffd75b" : "#9fffd5",
          90,
          15,
        );
        // Celebrate at the fence; show the single final-distance message on landing.
        if (this.hitPerfect) this.slowMotion = 0.13;
      }
      if (this.flightAge > 8 || p.y < -0.3 || d > 170) this.settle();
    } else if (s.pitchState === "result") {
      this.wait -= dt;
      if (this.wait <= 0) {
        if (s.pitchNumber >= s.totalPitches) this.finish();
        else this.resetBall();
      }
    }
    this.audio.update(dt, true, s.golden);
  }
  syncBat() {
    // The sensor is centered on the visible barrel, not on the grip.
    const bat = this.view.batter.bat;
    if (bat) {
      bat.updateWorldMatrix(true, false);
      const p = bat.localToWorld(
        this.view.desired.clone().set(0, BAT_CENTER_Y, 0),
      );
      this.physics.bat.setNextKinematicTranslation(p);
      this.physics.bat.setNextKinematicRotation(
        bat.getWorldQuaternion(this.view.camera.quaternion.clone()),
      );
    }
  }
  loop(now: number) {
    const wallDt = Math.max(0, (now - this.last) / 1000);
    const dt = Math.min(0.1, wallDt);
    this.last = now;
    // Present the resolved contact pose once before advancing ball flight and
    // follow-through together. Even a slow frame must not skip visible impact.
    const renderDt = this.contactFramePending ? 0 : dt;
    this.contactFramePending = false;
    this.update(renderDt, wallDt);
    const s = this.state;
    const p =
      s.pitchState === "pitching"
        ? this.pitching.position()
        : this.physics.position();
    this.view.update(renderDt, {
      ball: p,
      flight: s.pitchState === "flight",
      pitching: s.pitchState === "pitching",
      progress: this.pitching.progress,
      aim: this.controls.aim,
      golden: s.golden || (this.hitGolden && s.pitchState === "flight"),
      perfect: this.hitPerfect,
      menu:
        s.phase === "menu" || s.phase === "handoff" || s.phase === "results",
      visible:
        ["pitching", "flight", "result"].includes(s.pitchState) && p.y >= 0,
      paused: s.paused,
      reactionTarget: this.target,
    });
    this.syncBat();
    this.view.updateBoard(
      s.phase === "menu" ? "WELCOME, SLUGGER!" : s.stats.player,
      s.phase === "menu" ? s.records.highScore : s.stats.score,
      s.golden,
    );
    this.ui.update(
      s,
      dt,
      this.controls.aim,
      s.pitchState === "flight"
        ? Math.max(this.distance, this.estimatedDistance)
        : this.distance,
    );
    this.frame = requestAnimationFrame((t) => this.loop(t));
  }
  snapshot() {
    const s = this.state;
    return {
      mode: s.mode,
      currentPlayer: s.stats.player,
      phase: s.phase,
      timeRemaining: s.remaining,
      pitchNumber: s.pitchNumber,
      totalPitches: s.totalPitches,
      hits: s.hits.map((h) => ({ ...h })),
      cameraZoom: this.view.camera.zoom,
      trailCount: this.view.effects.trail.filter((t) => t.visible).length,
      score: s.stats.score,
      pitchState: s.pitchState,
      pitchProgress: this.pitching.progress,
      ballPosition: { ...this.physics.position() },
      ballVelocity: { ...this.physics.velocity() },
      swingResult: s.swingResult,
      timingErrorMs: this.timingErrorMs,
      targetReaction: this.targetReaction,
      ballScale: this.view.ball.scale.x,
      cameraPosition: this.view.camera.position.toArray(),
      targetStates: Object.fromEntries(
        [...this.view.targets].map(([id, model]) => [
          id,
          {
            reaction: model.reaction,
            damaged: model.damaged,
            hit: model.hit,
            scale: model.moving.scale.toArray(),
            rotation: model.moving.rotation.toArray().slice(0, 3),
            lights:
              id === "lights"
                ? model.surfaces[2].material.emissiveIntensity
                : null,
          },
        ]),
      ),
      idealContactTime: this.pitching.contactTime,
      contactPoint: { ...this.view.swingContact },
      barrelPosition: this.view.batter
        .bat!.localToWorld(this.view.desired.clone().set(0, 1.1, 0))
        .toArray(),
      homeRunCount: s.stats.homeRuns,
      multiplier: s.stats.multiplier,
      lastTargetHit: s.lastTarget,
      paused: s.paused,
      golden: s.golden,
      records: { ...s.records },
      aim: this.controls.aim,
    };
  }
  exposeDevelopmentControls() {
    const controls = {
      getState: () => this.snapshot(),
      getFraming: () => this.view.framing(),
      getVisualState: () => {
        const view = this.view;
        view.scene.updateMatrixWorld(true);
        return {
          loaded: Object.entries(view.assets)
            .filter(([, asset]) => !!asset)
            .map(([name]) => name),
          drawCalls: view.renderer.info.render.calls,
          triangles: view.renderer.info.render.triangles,
          geometries: view.renderer.info.memory.geometries,
          textures: view.renderer.info.memory.textures,
          batter: view.batter.group.name,
          hand: view.batter.arm
            .localToWorld(view.desired.clone().set(0.12, -0.42, 0))
            .toArray(),
          handle: view.batter
            .bat!.getWorldPosition(view.desired.clone())
            .toArray(),
          dinoHead: view.targets.get("dinosaur")!.moving.position.toArray(),
          dinoJaw: view.targets.get("dinosaur")!.extras[0].position.toArray(),
          ballColor: view.ballLeather.color.getHexString(),
          composition: view.polish.snapshot(),
          layout: {
            poles: [-1, 1].map((side) => {
              const x = (side * 72) / Math.sqrt(2),
                z = 72 / Math.sqrt(2);
              return [0, 24].map((y) => {
                const p = view.desired
                  .clone()
                  .set(x, y, z)
                  .project(view.camera);
                return [
                  ((p.x + 1) * innerWidth) / 2,
                  ((1 - p.y) * innerHeight) / 2,
                ];
              });
            }),
            crowdMinimumRadius: Math.min(
              ...view.crowdPeople.map((person) => person.radius),
            ),
          },
        };
      },
      startRound: (mode: Mode = "solo") => this.start(mode),
      predictablePitch: () => {
        if (this.state.phase !== "playing") this.start("solo");
        this.newPitch(true);
      },
      triggerContact: (quality: Quality = "Perfect") => {
        if (this.state.phase !== "playing") this.start("solo");
        if (!this.newPitch(true)) return;
        const errors: Record<Quality, number> = {
          "Too early": -0.8,
          Early: -0.5,
          Good: 0.3,
          Perfect: 0,
          Late: 0.5,
          Miss: 0.8,
        };
        this.pitching.elapsed = this.pitching.contactTime + errors[quality];
        this.swing(this.last);
      },
      testSwing: (errorMs: number) => {
        if (!Number.isFinite(errorMs))
          throw new Error("Use a finite timing error");
        if (this.state.phase !== "playing") this.start("solo");
        if (!this.newPitch(true)) return;
        this.pitching.elapsed = this.pitching.contactTime + errorMs / 1000;
        this.swing(this.last);
      },
      setTimingDebug: (enabled: boolean) => this.ui.setTimingDebug(enabled),
      launchAtTarget: (id: TargetId) => {
        if (this.state.phase !== "playing") this.start("solo");
        const t = TARGETS.find((t) => t.id === id);
        if (!t) throw new Error("Unknown target");
        if (!this.newPitch(true)) return;
        this.hitGolden = this.state.golden;
        const dest = { ...t.position };
        const seconds = 2.8;
        if (id === "ufo") {
          dest.x = Math.sin((this.view.elapsed + seconds / 1.7) * 0.24) * 13;
          dest.y = 25 + Math.sin(this.view.elapsed + seconds / 1.7) * 1.2;
        }
        const k = 0.055,
          f = (1 - Math.exp(-k * seconds)) / k;
        this.beginFlight(
          { x: 0, y: 1.65, z: CONTACT_Z },
          {
            x: dest.x / f,
            y: (dest.y - 1.65 + (13.8 / k) * (seconds - f)) / f,
            z: (dest.z - CONTACT_Z) / f,
          },
          "Perfect",
        );
      },
      advanceTime: (seconds: number) => {
        if (!Number.isFinite(seconds) || seconds < 0)
          throw new Error("Use a non-negative number of seconds");
        this.state.tick(seconds);
      },
      reset: () => this.home(),
    };
    Object.defineProperty(window, "__HOME_RUN_CHAOS__", {
      value: controls,
      configurable: true,
    });
  }
}
declare global {
  interface Window {
    __HOME_RUN_CHAOS__: {
      getState: () => ReturnType<Game["snapshot"]>;
      getFraming: () => ReturnType<Rendering["framing"]>;
      getVisualState: () => {
        loaded: string[];
        drawCalls: number;
        triangles: number;
        geometries: number;
        textures: number;
        batter: string;
        hand: number[];
        handle: number[];
        dinoHead: number[];
        dinoJaw: number[];
        ballColor: string;
        composition: ReturnType<Rendering["polish"]["snapshot"]>;
        layout: { poles: number[][][]; crowdMinimumRadius: number };
      };
      startRound: (mode?: Mode) => void;
      predictablePitch: () => void;
      triggerContact: (quality?: Quality) => void;
      testSwing: (errorMs: number) => void;
      setTimingDebug: (enabled: boolean) => void;
      launchAtTarget: (id: TargetId) => void;
      advanceTime: (seconds: number) => void;
      reset: () => void;
    };
  }
}
const loading = document.createElement("div");
loading.className = "loading";
loading.textContent = "⚾ WARMING UP THE CHAOS…";
document.body.append(loading);
Promise.all([initPhysics(), loadVisualAssets()])
  .then(async ([physics, assets]) => {
    const game = new Game(physics, assets);
    await game.ready;
    loading.remove();
  })
  .catch((error) => {
    console.error(error);
    loading.classList.add("error");
    loading.textContent =
      "The stadium could not load. Please use Chrome or Edge with hardware acceleration enabled, then refresh. " +
      String(error);
  });

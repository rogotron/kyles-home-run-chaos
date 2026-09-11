import type { TargetId } from "./types";
type Sound =
  | TargetId
  | "pitch"
  | "swing"
  | "contact"
  | "perfect"
  | "crowd"
  | "homerun"
  | "goal"
  | "dinosaur"
  | "ufo"
  | "pizza"
  | "toilet"
  | "countdown"
  | "end";
export class GameAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  muted = false;
  beat = 0;
  musicTimer = 0;
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }
  toggle() {
    this.unlock();
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.45;
    return this.muted;
  }
  tone(
    freq: number,
    length: number,
    type: OscillatorType = "sine",
    volume = 0.15,
    delay = 0,
    endFreq?: number,
  ) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq)
      o.frequency.exponentialRampToValueAtTime(
        Math.max(20, endFreq),
        t + length,
      );
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + length);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + length + 0.02);
  }
  noise(length: number, volume: number, frequency = 1500) {
    if (!this.ctx || !this.master) return;
    const b = this.ctx.createBuffer(
      1,
      this.ctx.sampleRate * length,
      this.ctx.sampleRate,
    );
    const a = b.getChannelData(0);
    for (let i = 0; i < a.length; i++)
      a[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / a.length, 1.4);
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = frequency;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start();
  }
  play(sound: Sound) {
    if (sound === "pitch") {
      this.noise(0.12, 0.1, 800);
      this.tone(450, 0.1, "sine", 0.06);
    }
    if (sound === "swing") this.noise(0.18, 0.23, 2300);
    if (sound === "contact" || sound === "perfect") {
      this.noise(0.13, sound === "perfect" ? 0.85 : 0.55, 1700);
      this.tone(sound === "perfect" ? 220 : 160, 0.16, "triangle", 0.6, 0, 65);
      if (sound === "perfect") {
        [523, 784, 1047].forEach((f, i) =>
          this.tone(f, 0.22, "sine", 0.15, i * 0.04),
        );
      }
    }
    if (sound === "crowd") {
      this.noise(1.7, 0.45, 700);
      this.noise(1.1, 0.25, 2000);
    }
    if (sound === "homerun" || sound === "goal" || sound === "end") {
      [392, 523, 659, 784, 1047].forEach((f, i) =>
        this.tone(f, 0.3, "triangle", 0.22, i * 0.115),
      );
      this.play("crowd");
    }
    if (sound === "dinosaur") {
      this.tone(120, 0.6, "sawtooth", 0.18, 0, 40);
      this.tone(75, 0.4, "triangle", 0.4, 0.5, 170);
    }
    if (sound === "ufo") {
      [0, 0.15, 0.3, 0.45].forEach((d) =>
        this.tone(300, 0.3, "sine", 0.2, d, 1600),
      );
    }
    if (sound === "pizza") {
      [660, 880, 1100].forEach((f, i) =>
        this.tone(f, 0.2, "square", 0.09, i * 0.13),
      );
    }
    if (sound === "toilet") {
      this.noise(1.9, 0.5, 550);
      this.tone(180, 1.8, "sine", 0.4, 0, 35);
      this.tone(700, 0.12, "square", 0.15, 0.4, 430);
    }
    if (sound === "scoreboard") {
      [523, 659, 784, 1047, 1319, 1568].forEach((f, i) =>
        this.tone(f, 0.2, "square", 0.08, i * 0.14),
      );
    }
    if (sound === "lights") {
      this.noise(0.35, 0.3, 4500);
      this.tone(180, 0.3, "sawtooth", 0.1, 0, 35);
    }
    if (sound === "baseball") {
      this.noise(0.13, 0.55, 1400);
      this.tone(500, 0.5, "sine", 0.2, 0, 75);
    }
    if (sound === "mascot")
      [0, 0.25, 0.5, 0.8].forEach((d) =>
        this.tone(260, 0.25, "triangle", 0.14, d, 520),
      );
    if (sound === "hotdog") {
      this.noise(1.5, 0.3, 1700);
      this.tone(600, 1.5, "sine", 0.15, 0, 55);
    }
    if (sound === "countdown") this.tone(880, 0.13, "sine", 0.17);
  }
  update(dt: number, active: boolean, golden: boolean) {
    if (!active || !this.ctx) return;
    this.musicTimer -= dt;
    if (this.musicTimer <= 0) {
      this.musicTimer = golden ? 0.19 : 0.28;
      this.beat++;
      const bass = [130.81, 130.81, 164.81, 196, 110, 110, 146.83, 196][
        Math.floor(this.beat / 2) % 8
      ];
      if (this.beat % 2 === 0)
        this.tone(bass, 0.16, "triangle", golden ? 0.085 : 0.045);
      if (golden) this.noise(0.06, 0.045, 6000);
      if (this.beat % 8 === 0) this.tone(bass * 4, 0.22, "sine", 0.035);
    }
  }
}

import type { GameState } from "./state";
import { TARGETS } from "./types";
import type { Mode, Quality } from "./types";
export class UI {
  root = document.querySelector<HTMLDivElement>("#ui")!;
  mode: Mode = "solo";
  screen = "";
  toastTime = 0;
  // Temporary calibration overlay: on in development, opt in for built previews.
  timingDebug =
    new URLSearchParams(location.search).get("timingDebug") === "1" ||
    (import.meta.env.DEV &&
      new URLSearchParams(location.search).get("timingDebug") !== "0");
  constructor(actions: {
    start: (mode: Mode) => void;
    pause: () => void;
    restart: () => void;
    home: () => void;
    sound: () => boolean;
  }) {
    this.root.innerHTML = `
      <header class="topbar"><a class="brand" href="#" aria-label="Kyle’s Home Run Chaos home"><span class="brand-ball">⚾</span><span><b id="player-label">KYLE’S</b><strong>HOME RUN CHAOS<span class="brand-dot">.</span></strong></span></a><span class="park-tag"><i></i> CHAOS PARK <span> / </span> OPEN FOR NONSENSE</span><div class="top-actions"><button id="sound" class="icon-button" aria-label="Mute sound" title="Sound on / off">♪</button><button id="pause" class="icon-button" aria-label="Pause game" title="Pause · P">Ⅱ</button></div></header>
      <section id="hud" class="hud compact-hud hidden" aria-label="Round statistics">
        <div class="hud-stat hud-score"><span>SCORE</span><strong id="score">0</strong></div>
        <div class="hud-stat"><span>HOME RUNS</span><strong id="home-runs">0</strong></div>
        <div class="hud-stat"><span>MULTIPLIER</span><strong id="multiplier">1×</strong></div>
        <div class="hud-stat"><span>PERSONAL BEST</span><strong id="personal-best">0</strong></div>
        <div class="hud-stat pitch-count-wrap"><strong id="pitch-count">Pitch 1 of 10</strong></div>
      </section>
      <section id="menu" class="menu"><div class="hero-copy"><span class="pill"><i></i> THE NOT-SO-ORDINARY HOME RUN DERBY</span><h1>SWING BIG.<br/><em>GET SILLY.</em></h1><p>One bat. A stadium full of targets.<br/>Ten pitches to make a little chaos.</p><div class="record-line"><span>★ PERSONAL BEST <b id="best">0</b></span><span>↗ LONGEST <b id="record-longest">0 FT</b></span></div></div><div class="start-panel"><div class="panel-kicker">HEY, SLUGGER. <span>LET’S PLAY.</span></div><div class="mode-switch" role="group" aria-label="Game mode"><button id="solo-mode" class="selected" aria-pressed="true">SOLO DERBY</button><button id="versus-mode" aria-pressed="false">KYLE vs. DAD</button></div><p id="mode-description">Your best swing. Your next high score.</p><button id="play" class="play-button">LET’S MAKE CHAOS <span>↗</span></button><div class="start-hint">Press <kbd>SPACE</kbd> or tap to play</div><div class="timing-guide"><span class="timing-early">EARLY ↖</span><span class="timing-perfect">PERFECT ↑</span><span class="timing-late">LATE ↗</span></div><p class="timing-help">Swing as the ball reaches the glowing box in front of the plate. Early goes to left field, late pulls to right. The closer to perfect, the better your shot at a target.<br/><b>Pitches 9 & 10 are golden: double points!</b></p><div class="quick-controls"><span><b>↔</b> Move to aim</span><span><b>␣</b> Space / click to swing</span></div></div></section>
      <output id="timing-debug" class="timing-debug hidden" aria-live="polite">TIMING: swing to measure · − early / + late</output>
      <div id="announcement" class="announcement hidden" role="status" aria-live="polite"><strong id="announcement-text"></strong></div>
      <section id="targets" class="target-strip" aria-label="Silly targets">${[
        ...TARGETS,
      ]
        .reverse()
        .map(
          (t) =>
            `<div class="target-card" data-target="${t.id}" style="--target:${t.color}"><span class="target-icon">${{ goal: "⚽", dinosaur: "🦖", ufo: "🛸", icecream: "🍦", toilet: "🚽", scoreboard: "🎯", lights: "💡", baseball: "⚾", mascot: "🎈", sock: "🧦" }[t.id]}</span><div><strong>${t.name.toUpperCase()}</strong><span>${t.label}</span></div><i>↗</i></div>`,
        )
        .join("")}</section>
      <footer class="bottom-bar"><span><b>MOVE MOUSE / ← →</b> AIM <i>·</i> <b>SPACE / CLICK</b> SWING <i>·</i> <b>P</b> PAUSE <i>·</i> <b>R</b> RESTART</span><span class="footer-right">SMALL SLUGGER. <b>LEGENDARY CHAOS.</b></span></footer>
      <div id="touch-controls" class="touch-controls hidden"><label>← AIM →<input id="touch-aim" type="range" min="-1" max="1" step=".01" value="0" dir="rtl" aria-label="Aim direction"/></label><button id="touch-swing">SWING!</button></div>
      <section id="pause-screen" class="modal hidden" role="dialog" aria-modal="true" aria-label="Paused"><div class="modal-card"><span class="eyebrow">TAKE A BREATHER</span><h2>SNACK BREAK?</h2><p>Your round is right where you left it.</p><button id="resume" class="play-button">BACK TO THE BAT <span>↗</span></button><button id="restart-paused" class="text-button">Restart this round</button><button id="home-paused" class="text-button">Back to the stadium</button></div></section>
      <section id="end-screen" class="modal hidden" role="dialog" aria-modal="true" aria-label="Round result"><div class="modal-card results-card"><span id="end-eyebrow" class="eyebrow"></span><h2 id="end-title"></h2><p id="end-description"></p><div id="end-stats" class="end-stats"></div><details id="round-details" class="round-details"><summary>Round details &amp; scoring</summary><div id="secondary-stats"></div><ol id="hit-history"></ol></details><button id="next" class="play-button"></button><button id="home" class="text-button">Back to the stadium</button></div></section>`;
    this.setTimingDebug(this.timingDebug);
    const select = (mode: Mode) => {
      this.mode = mode;
      this.el("solo-mode").classList.toggle("selected", mode === "solo");
      this.el("versus-mode").classList.toggle("selected", mode === "versus");
      this.el("solo-mode").setAttribute(
        "aria-pressed",
        String(mode === "solo"),
      );
      this.el("versus-mode").setAttribute(
        "aria-pressed",
        String(mode === "versus"),
      );
      this.text(
        "mode-description",
        mode === "solo"
          ? "Your best swing. Your next high score."
          : "Kyle bats first. Then Dad. Bragging rights forever.",
      );
    };
    this.el("solo-mode").onclick = () => select("solo");
    this.el("versus-mode").onclick = () => select("versus");
    this.el("play").onclick = () => actions.start(this.mode);
    this.el("pause").onclick = actions.pause;
    this.el("resume").onclick = actions.pause;
    this.el("restart-paused").onclick = actions.restart;
    this.el("home-paused").onclick = actions.home;
    this.el("next").onclick = () => actions.start(this.mode);
    this.el("home").onclick = actions.home;
    this.el("sound").onclick = () => {
      const muted = actions.sound();
      this.text("sound", muted ? "♫̸" : "♪");
      this.el("sound").setAttribute(
        "aria-label",
        muted ? "Unmute sound" : "Mute sound",
      );
    };
    this.root.querySelector<HTMLAnchorElement>(".brand")!.onclick = (e) => {
      e.preventDefault();
      actions.home();
    };
  }
  setTimingDebug(enabled: boolean) {
    this.timingDebug = enabled;
    this.el("timing-debug").classList.toggle("hidden", !enabled);
  }
  showTiming(errorMs: number, quality: Quality) {
    const ms = Math.round(errorMs);
    this.text(
      "timing-debug",
      `TIMING ${ms > 0 ? "+" : ""}${ms} ms · ${quality} · − early / + late`,
    );
  }
  el(id: string) {
    return document.getElementById(id)!;
  }
  text(id: string, text: string) {
    const e = this.el(id);
    if (e.textContent !== text) e.textContent = text;
  }
  show(id: string, visible: boolean) {
    this.el(id).classList.toggle("hidden", !visible);
  }
  announce(text: string, _kicker = "", duration = 1.4) {
    this.text("announcement-text", text);

    this.toastTime = duration;
    this.show("announcement", true);
    this.el("announcement").classList.remove("pop");
    void this.el("announcement").offsetWidth;
    this.el("announcement").classList.add("pop");
  }
  update(s: GameState, dt: number, _aim: number, _distance: number) {
    const playing = s.phase === "playing";
    this.show("menu", s.phase === "menu");
    this.show("hud", playing);
    this.show("pause-screen", s.paused);
    this.show("targets", s.phase === "menu");
    this.show("touch-controls", playing && !s.paused);
    this.root.classList.toggle("is-playing", playing);
    this.root.classList.toggle("is-golden", s.golden);
    (this.el("pause") as HTMLButtonElement).disabled = !playing;
    this.text(
      "player-label",
      playing ? s.stats.player.toUpperCase() + " AT BAT" : "KYLE’S",
    );
    const score = s.stats.score.toLocaleString();
    if (this.el("score").textContent !== score) {
      this.el("score").animate(
        [
          { transform: "scale(1.12)", color: "#ffdc78" },
          { transform: "scale(1)", color: "#fff9e9" },
        ],
        { duration: 220 },
      );
      this.text("score", score);
    }
    this.text("home-runs", String(s.stats.homeRuns));
    this.text(
      "multiplier",
      String(s.stats.multiplier * (s.golden ? 2 : 1)) + "×",
    );
    this.text("personal-best", s.records.highScore.toLocaleString());
    this.text(
      "pitch-count",
      "Pitch " + Math.max(1, s.pitchNumber) + " of " + s.totalPitches,
    );
    this.el("pitch-count").title = s.golden
      ? "Golden baseball · double points"
      : "Every pitch counts";
    this.text("best", s.records.highScore.toLocaleString());
    this.text("record-longest", s.records.longest + " FT");
    if (!s.paused) this.toastTime -= dt;
    this.show("announcement", this.toastTime > 0 && !s.paused && playing);
    const key = s.phase + s.rounds.map((r) => r.score).join(",");
    if (key === this.screen) return;
    this.screen = key;
    this.show("end-screen", s.phase === "handoff" || s.phase === "results");
    if (s.phase !== "handoff" && s.phase !== "results") return;
    (this.el("round-details") as HTMLDetailsElement).open = false;
    this.el("secondary-stats").innerHTML = s.rounds
      .map(
        (r) =>
          "<p><b>" +
          r.player +
          "</b> · Longest " +
          r.longest +
          " FT · Best streak " +
          r.bestStreak +
          "</p>",
      )
      .join("");
    this.el("hit-history").innerHTML = s.hits
      .map(
        (h) =>
          "<li><strong>Pitch " +
          h.pitch +
          " · " +
          h.message +
          " <span>+" +
          h.points.toLocaleString() +
          "</span></strong><small>" +
          h.calculation +
          "</small></li>",
      )
      .join("");
    if (s.phase === "handoff") {
      this.text("end-eyebrow", "KYLE’S 10 PITCHES · COMPLETE");
      this.text("end-title", "YOU’RE UP, DAD.");
      this.text(
        "end-description",
        "Pass the controls. Dad gets ten pitches, too.",
      );
      this.el("end-stats").innerHTML =
        "<div><b>" +
        s.stats.score.toLocaleString() +
        "</b><span>KYLE’S SCORE · " +
        s.stats.homeRuns +
        " HOME RUNS</span></div>";
      this.text("next", "DAD’S TURN →");
      return;
    }
    const k = s.rounds[0],
      d = s.rounds[1];
    this.text(
      "end-eyebrow",
      d ? "FAMILY SHOWDOWN · FINAL SCORE" : "10 PITCHES · ROUND COMPLETE",
    );
    this.text(
      "end-title",
      d
        ? k.score === d.score
          ? "IT’S A TIE!"
          : (k.score > d.score ? "KYLE" : "DAD") + " WINS!"
        : s.stats.score >= s.records.highScore && s.stats.score > 0
          ? "NEW HIGH SCORE!"
          : "NICE ROUND, KYLE!",
    );
    this.text(
      "end-description",
      d
        ? "Good game. One more showdown?"
        : s.stats.homeRuns + " home runs. Ready for another ten?",
    );
    this.el("end-stats").innerHTML = s.rounds
      .map(
        (r) =>
          "<div><b>" +
          r.score.toLocaleString() +
          "</b><span>" +
          r.player.toUpperCase() +
          " · " +
          r.homeRuns +
          " HOME RUNS</span></div>",
      )
      .join("");
    this.text("next", "PLAY AGAIN →");
  }
}

# Clarity and ten-pitch round verification

Verified locally on Windows with Chromium, WebGL 2, and AMD Radeon 880M graphics.

- **42 Vitest tests passed**, including timing direction/power, pitch limits, pause behavior, scoring, persistence, and ordinary-swing Rapier trajectories to every target.
- **16 Playwright tests passed**, including actual keyboard/mouse contact, all five targets, golden pitches, pass-and-play, touch controls, and pause/restart. A complete unattended ten-pitch round verifies that misses count; the tenth-flight regression verifies that results wait for scoring.
- **Three full ten-pitch rounds passed** using automatic pitches and real Space/mouse inputs, with no timer, forced-contact, or target-launch controls. Kyle scored 63,970, Dad scored 67,590, and the solo replay scored 63,158. Each round recorded exactly ten pitches and ten outcomes, including misses, target hits, and two golden pitches. The repeatable script writes its results to `.local/playtest-report.json`.
- The production build was played with real keyboard input and registered a home run. Its development interface was absent and it emitted **no browser console errors**.
- A production render sample averaged **60 FPS**, with a **17 ms 95th-percentile frame interval**, on this machine. This is a local observation, not a guarantee for every laptop.
- Desktop and 390 × 844 touch screenshots were inspected. Gameplay keeps only five HUD statistics, a single brief outcome message, and touch controls where needed. Instructions and detailed scoring are on the start/results screens.
- Projected-size measurements against the previous batting camera: batter **+37.0%**, pitcher **+39.0%**, baseball **+37.4%**, strike zone **+37.4%**. The new outline and short trail are visible on incoming pitches and batted balls.

The Rapier compatibility package currently emits a harmless initialization deprecation warning. Its embedded WebAssembly also produces Vite’s large-chunk advisory. Neither blocks gameplay or the production build.

Useful repeatable commands:

```powershell
npm test
npm run test:e2e
npm run test:targets
npm run playtest
npm run build
npm run preview
# In another terminal, while preview is running:
node scripts/verify-production.mjs
```

Browser screenshots and reports are generated locally in `test-results/`, `playwright-report/`, and `.local/`; these generated artifacts are excluded from version control.

Batter-position correction: both feet remain inside the existing box throughout the swing, centered lengthwise, with 0.37 world units of lateral clearance from the plate and 0.06 behind its front edge. Five geometry regressions verify the stance, contact barrel/hand alignment across pitch locations, and unchanged pitch duration. The full 16-test browser suite passed after the correction, and ready/contact screenshots were inspected. Camera settings and strike-zone position are unchanged.


## Batting timing recalibration (2026-09-06)

Ideal contact is now 100 ms earlier (1.45 seconds for a predictable pitch), at z = 1.4 ahead of the plate. The glowing box uses that same plane. The incoming ball eases into a final approach that keeps the entire perfect/good window ahead of the plate, and the bat aims through its actual input-time position. Input resolves synchronously, including the fraction of a frame since the last update. The first rendered impact frame precedes the follow-through and outgoing ball motion.

Perfect contact accepts inclusive +/-90 ms; good contact accepts inclusive +/-180 ms. Weaker early/late hits retain directional spray. A signed timing readout reports every attempted pitch swing, including misses. It defaults on in development and off in production; use `?timingDebug=0` to disable it or `?timingDebug=1` to enable it. Development controls also provide `setTimingDebug(false)` and `testSwing(errorMs)`.

- 53 unit tests passed, covering timing boundaries, forward contact, continuous ball approach, bat/ball alignment, fixed feet, scoring, and target trajectories.
- The three new browser timing tests passed three consecutive runs, including real keydown timing and exact first-frame bat/ball alignment at both perfect and good boundaries. The browser clock is installed before game startup so every animation callback uses the same clock.
- Early, perfect, and late contact screenshots were generated in `test-results/`; the early and perfect frames were visually inspected after the approach and bat-reach refinement.
- The final production build passed.
- All 19 browser regression tests passed after the final refinement, including keyboard/mouse/touch input, all five targets, complete ten-pitch rounds, and the timing checks.


## Casual arcade difficulty follow-up (2026-09-06)

Supersedes the earlier timing-window values above: perfect now accepts +/-200 ms, good +/-400 ms, and ordinary contact +/-600 ms. The automatic missed-pitch cutoff uses the same outer limit, allowing late inputs throughout the full window. The existing forward contact point, pitch path and speed, immediate input handling, graphics, exit-velocity formulas, and scoring rules are unchanged.

A real-time automated beginner simulation used actual Space-key input on ten automatic pitches. Cues used the visible ball position with deliberately varied timing; no pitch, contact, clock, or score mutation hooks were used. It made **9 contacts and 4 perfect hits in 10 pitches**. The deliberately much-too-early attempt (-876 ms) missed; attempts at -502 ms and +529 ms produced weaker early/late hits. The four perfect errors were -155, +131, -25, and +185 ms. This is simulated beginner timing, not an observed human usability session.

Run `npm run playtest:forgiving` with the development server running to repeat it. Detailed results are in `.local/forgiving-round-report.json`, with a result screenshot alongside it. The script requires at least nine contacts, at least three perfect hits, and the deliberately early miss. All 54 unit tests and the production build passed.
All 20 browser regressions also passed, including immediate contact alignment across the larger windows and a real keydown at +550 ms followed by an untouched-pitch miss outside the window.


## Interactive stadium targets (2026-09-06)

Added scoreboard (+4,000), light tower (+1,500), inflatable baseball (+1,500), wobbly mascot (+2,000), and inflatable hot dog (+2,500) targets; upgraded the existing +5,000 toilet to an open bowl and water/drain reaction. Existing target bonuses and distance/streak/golden scoring formulas remain intact, as do the batting windows, pitch speed, ball-flight physics, and batting camera.

Each hit follows the ball through a 2.1-second reaction before awarding one target bonus and proceeding to the next pitch. Scoreboard surfaces flash while numbers count up; the light bank flickers and dims for the play; the toilet spirals the ball across the water before shrinking it down the drain. The mascot wobbles, the baseball pops flat, and the hot dog deflates. Damaged inflatables stay flattened and non-scoring across pitches until a new round. Temporary effects and lighting reset before the next pitch; pause freezes the reaction.

The new target collision shapes come from the same geometry as their visible surfaces. Physics sweeps the baseball across each fixed step and records each target once per ball. Unit regressions verify thin-panel hits, no hit at an empty inflatable bounding-box corner, bowl exterior/water contact, no flush for a ball above the bowl, and damaged-target reset rules.

All ten targets are reachable with legal aim and actual timing-derived launch velocities, with every target and obstacle present. The scan records multiple successful combinations for every target in `.local/target-reachability.json`. The scoreboard and bowl were moved into normal-swing range; the new props were spaced for the existing batting view.

64 unit tests and the production build passed. Stadium, contact, flush, light, scoreboard, and inflatable reaction screenshots were inspected; nearby target signs are hidden during reaction shots to keep the ball and active target clear. The expanded menu target catalogue scrolls horizontally rather than covering the play controls.

All 34 browser regressions passed, including actual mouse aim and Space-key batting to the scoreboard, light tower, bowl, baseball, mascot, and hot dog. Every new reaction completes before the bonus is recorded once; flush/pause, lighting reset, persistent deflation, round reset, keyboard/mouse/touch batting, existing targets, golden scoring, and ten-pitch results also pass. Final cosmetic label positions keep point values above the fence and away from the HUD without altering collision shapes or the batting camera.

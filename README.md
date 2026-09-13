# Kyle’s Home Run Chaos

A complete, original 3D arcade home run derby for a kid and a parent. Swing at automatic pitches, chase a home run streak, and hit a hungry dinosaur, soccer goal, UFO, ice cream truck, or giant flushing toilet. Smash the scoreboard, knock out a light tower, and pop or wobble oversized inflatable toys.

## Play locally

Requires Node.js 22.12+ or 24 LTS and Chrome or Edge with hardware acceleration enabled.

```powershell
npm install
npm run dev
```

Open **http://localhost:5173**. The stadium is the start screen. Press **Space**, click the play button, or tap to begin. Original Blender assets ship with the game and load locally; labels, particles, remaining target models, and audio are procedural. No accounts, external asset downloads, paid services, or external fonts.

The Blender 5.2.1 LTS visual slice includes the field, stadium, batter, bat,
baseball, home plate, and dinosaur. See [asset sources and rebuild instructions](assets/source/blender/README.md)
and the [before-and-after gallery](artifacts/visuals/comparison.html). Physics and
gameplay retain their existing colliders and behavior; procedural models remain
available as startup fallbacks.

## Deployment

Vercel builds this static Vite game with `npm run build` and serves `dist/`.
No environment variables or backend services are required. Original GLB assets
are included in the deployment; editable Blender sources and verification
screenshots remain in the repository. Check a deployed game with Playwright:

```powershell
node scripts/verify-production.mjs https://your-deployment.vercel.app
```

## Controls

| Action                         | Desktop                    | Touch                  |
| ------------------------------ | -------------------------- | ---------------------- |
| Aim                            | Move mouse or hold ← / →   | Drag the aim slider    |
| Swing                          | Space or click the field   | Tap SWING or the field |
| Pause / resume                 | P, Escape, or pause button | Pause button           |
| Restart current player’s round | R                          | Pause → Restart        |
| Sound                          | Music-note button          | Music-note button      |

Swing as the ball reaches the glowing box in front of home plate. Ideal contact is 100 ms earlier than the previous timing (1.45 seconds on a predictable pitch). Perfect contact allows ±200 ms; good contact allows ±400 ms. Weaker early/late hits remain available out to ±600 ms, for a broad 1.2-second contact window. Only swings clearly outside that window miss. Aim sets the base direction. Kyle bats left-handed: early contact goes to left field (opposite field), and late contact goes to right field (pull). Poor timing increasingly overrides aim. Timing also determines power, with the strongest launch at perfect contact. Pitch location still influences the trajectory. Target assistance increases smoothly as timing approaches zero error, even within the Perfect window: aim near a target and a well-timed swing adjusts both direction and arc toward it. Assistance fades out at ±400 ms. The launch accounts for gravity and drag, aims into the toilet bowl, leads the moving UFO, and skips popped or deflated targets. Flight and target bonuses still require actual physics collisions. Perfect hits have a stronger crack, particles, camera feedback, slow motion, and a bright trail.

Solo is one ten-pitch round. Kyle vs. Dad gives each player ten pitches, with a handoff and a large Play Again button for the rematch. Every pitch counts, including misses and fouls. The tenth ball finishes its flight and scoring before results appear. Pausing or switching tabs freezes the round. Pitches 9 and 10 are golden and worth double points. High scores and longest home runs are stored locally in this browser.

The in-game HUD shows only score, home runs, active multiplier, personal best, and **Pitch X of 10**. The active multiplier includes the golden-pitch boost. Instructions and target values remain on the start screen. The camera uses a 1.4× batting zoom; every moving ball has a contrasting outline and a short trail, with stronger effects for perfect hits.

## Scoring

- Fair distance: **5 points per foot**.
- Home run: **1,000 bonus points**, then distance points.
- Consecutive home runs: **1×, 1.5×, 2×, 2.5×, 3×**. A miss or non-home-run resets the streak.
- Soccer goal: **triple the entire hit**.
- Ice cream truck **+2,000**, UFO **+3,000**, dinosaur mouth **+4,000**, toilet **+5,000**.
- Scoreboard **+4,000**, light tower **+1,500**, inflatable baseball **+1,500**, wobbly mascot **+2,000**, inflatable sock **+2,500**.
- Golden balls: **double the entire hit**, including target and streak bonuses.

Each outcome appears as one large, brief message. The results screen’s Round details disclosure preserves every pitch’s score calculation, longest home runs, and best streaks. All targets use Rapier collision events; home runs must cross the fair outfield fence above its top.

Stadium target reactions follow the ball for **2.1 seconds**, then show the scored result briefly before the next pitch. Scoreboard numbers count up during a bright electronic celebration. The light bank flickers, then stays dim until the next pitch. The toilet's open bowl and water surface trigger **FLUSHED IT! +5,000**: the ball swirls on the water and shrinks down the drain. The mascot wobbles, the baseball pops flat, and the sock slowly deflates. Popped/deflated toys remain visibly changed and inactive until the next round, with a "BACK NEXT ROUND" sign. Other temporary effects reset before the next pitch, and pause freezes the reaction.

All new target surfaces use the same geometry for rendering and collision. A swept baseball catches thin surfaces between physics steps; empty corners and the space above the toilet do not score. Each ball can claim its target bonus only once. Target bonuses use the existing distance, streak, goal, and golden-ball scoring formulas. The new scoreboard and toilet are placed within normal swing range; the forgiving contact windows, pitch speed, and ball-flight physics remain unchanged.

Tip: aim toward any stadium target and time your swing at the glowing box. Near-perfect contact adjusts the arc for low targets like the toilet as well as high targets like the lights.

## Build and tests

```powershell
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm run preview
```

The production build is in `dist/`; preview serves it at **http://localhost:4173**. Serve it over HTTP rather than opening the HTML file directly. The physics bundle includes Rapier’s WebAssembly, so its compressed size is larger than the game code.

Vitest checks timing boundaries, contact power and aim, score multipliers, fair/foul scoring, round transitions, pitch limits and pause behavior, and saved records. Playwright checks real Space/click swings, keyboard aiming, misses, home runs, all five actual target collisions, gold, pass-and-play, persistence, pause/restart, and touch controls. Windows browser tests request Direct3D 11 to avoid slow software WebGL.

With the development server running, `node scripts/playtest-rounds.mjs` plays **three complete ten-pitch rounds using actual keyboard/mouse controls**, with no forced pitches, contact, or timer changes. It saves screenshots and a report in `.local/`. `node scripts/inspect-browser.mjs` runs a short real-control graphics check.

`npm run playtest:forgiving` runs one ten-pitch beginner simulation with real keyboard input and varied cues based on the visible ball position. It requires at least nine contacts and three perfect hits, plus a deliberately much-too-early miss, and saves the measured timing/errors and round results in `.local/forgiving-round-report.json`. This is an automated usability check, not a human playtest.

`npm run test:targets` scans legal aim, pitch-height, and timing combinations with all targets and obstacles present, saving successful normal-swing profiles to `.local/target-reachability.json`. `node scripts/inspect-targets.mjs` captures the stadium and each new reaction in `.local/targets/`. Browser tests also reach each new target with mouse aiming and an actual Space-key swing on an ordinary center pitch, rather than using forced target launches.

## Architecture

| Module                       | Responsibility                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/main.ts`                | Game coordinator, round/flight lifecycle, development interface                                |
| `src/state.ts`               | Round state, player handoff, local records                                                     |
| `src/rendering.ts`           | Three.js stadium, lighting, camera, animation                                                  |
| `src/models.ts`              | Original procedural characters and target models                                               |
| `src/physics.ts`             | Fixed-step Rapier world, CCD baseball, kinematic bat and targets, field and stadium collisions |
| `src/batting.ts`             | Mouse/keyboard/touch input and contact launch velocity                                         |
| `src/pitching.ts`            | Automatic pitches and varied strike-zone locations                                             |
| `src/scoring.ts`             | Pure contact classification and scoring rules                                                  |
| `src/effects.ts`             | Instanced particles and bright ball trails                                                     |
| `src/audio.ts`               | Web Audio synthesizer, reactions, rhythmic accompaniment                                       |
| `src/ui.ts`, `src/style.css` | Responsive game HUD, menus, touch controls                                                     |

Pitching follows a controlled kinematic path. Batting uses an assisted contact window and calculated exit velocity instead of relying on a tiny, frame-sensitive bat collision. The ball eases into its final approach so the forgiving windows stay within a believable bat reach. Input resolves immediately, including the time since the last frame. The barrel meets the incoming ball at its actual position; the first rendered contact frame is shown before ball flight and follow-through advance. The glowing box shares the ideal contact plane at z = 1.4, ahead of the plate’s front edge. The animated bat has a matching Rapier sensor. After contact the dynamic baseball uses gravity, air drag, CCD, restitution, and target collision events. Static stadium meshes are merged by material, crowds and particles are instanced, and shadows refresh at a reduced rate.

## Development interface

Only the Vite development server exposes `window.__HOME_RUN_CHAOS__`; it is removed from production builds.

```js
const game = window.__HOME_RUN_CHAOS__;
game.getState();
game.startRound("solo"); // or 'versus'
game.predictablePitch();
game.triggerContact("Perfect"); // Too early, Early, Good, Perfect, Late, Miss
game.launchAtTarget("goal"); // also dinosaur, ufo, icecream, toilet, scoreboard, lights, baseball, mascot, sock
game.testSwing(-90); // deterministic timing offset in milliseconds; negative = early
game.setTimingDebug(false); // hide the temporary timing readout without reloading
game.getFraming(); // projected size ratios against the previous batting camera
game.advanceTime(51); // legacy diagnostic clock only; cannot consume pitches or end rounds
game.reset();
```

`getState()` returns mode, phase, currentPlayer, timeRemaining (legacy diagnostic), pitchNumber, totalPitches, hits, cameraZoom, trailCount, score, pitchState, pitchProgress, ballPosition, ballVelocity, swingResult, homeRunCount, multiplier, lastTargetHit, paused, golden, aim, and records. `getState()` also includes timingErrorMs, idealContactTime, contactPoint, and barrelPosition for calibration, plus targetReaction, targetStates, ballScale, and cameraPosition for reaction checks. Target test launches still travel through the actual physics simulation and collide with the target sensor.

The temporary timing readout is enabled by default on the development server and shows the last attempted pitch swing, including misses. Negative milliseconds mean early; positive mean late. Open **http://localhost:5173/?timingDebug=0** to disable it, or use `game.setTimingDebug(false)`. Production builds hide it by default; `?timingDebug=1` enables it for preview testing. The readout stays outside the five-stat player HUD.

## Kyle’s next picks

1. Moon Ballpark, with low gravity and bouncing asteroid targets.
2. Banana bats, rocket balls, and a giant-bat power-up.
3. Custom uniforms, characters, and celebratory dances.
4. A pirate ship, giant robot, or a flying pancake stack.
5. More stadium challenges and a family tournament bracket.


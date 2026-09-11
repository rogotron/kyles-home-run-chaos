# Blender visual slice verification — 2026-09-10

Implemented and exported with the supplied Blender 5.2.1 LTS executable.
Sources and reproducible script: `assets/source/blender/`.
Runtime exports: `public/assets/models/`.

## Final checks

- `npm test`: **79 passed**, across five test files.
- `npm run build`: **passed**, including TypeScript checking and Vite production output.
- `npm run test:e2e`: **39 passed**. Covers real keyboard/mouse/touch input,
  all targets, scores, golden pitches, versus handoff, pause/restart, ten-pitch
  rounds, camera framing, immediate bat/ball alignment and the new asset checks.
- Asset checks: all seven GLBs load locally, no external resources or image
  dependencies, geometry/material budget, imported hand/handle alignment,
  golden leather color, slow-loading overlay and playable procedural fallbacks.
- `node scripts/verify-production.mjs`: **passed**. Real keyboard scoring
  produced 4,805 points. Development controls are absent from the built game.
- Normal loaded game: **zero browser console errors**, all seven models HTTP 200.
- No changes to Rapier colliders, physics constants, pitching, scoring, target
  definitions, input rules, swing calculations or camera movement logic.

Non-failing toolchain notices remain: Rapier initialization deprecation in unit
tests and Vite's vendor-chunk size advisory for Three.js/Rapier.

## Measured performance

Chromium / ANGLE D3D11, AMD Radeon 880M integrated GPU, 1440 × 900 viewport.

| Capture | Average FPS | p95 frame time |
| --- | ---: | ---: |
| Original menu/park baseline | 60.00 | 16.7 ms |
| Final menu/park | 60.00 | 16.7 ms |
| Built game during active play | 59 | 17 ms |

These are measurements on this laptop, not a guarantee for every device. The
existing pixel ratio cap, shadow resolution and shadow update cadence remain.

The new assets contain **141,924 triangles**, **59 material batches**, and
**6,626,696 bytes** in total (6.32 MiB). They have **zero texture images**.
The game still has its existing generated label/scoreboard/particle textures
and animated crowd. A sampled complete frame reported 949 draws and 221,331
triangles; frame counts vary with shadows, camera, crowd and effects. The
asset budget is distinct from these inherited full-scene costs.

## Comparison evidence

- `before/stadium.png`, `before/batting.png`, `before/dinosaur.png`: captured
  from the original procedural game before integration.
- `after/stadium.png`, `after/batting.png`, `after/dinosaur.png`: final exports
  in the actual game, with the existing HUD and camera logic.
- `comparison.html`: full gallery.
- `comparison.png`: complete comparison sheet.
- `comparison-batting.png`, `comparison-dinosaur.png`: individual comparison rows.
- `production-play.png`: live built-game screenshot after real keyboard scoring.
- `before/report.json`, `after/report.json`, `production-report.json`: raw measurements.

Both baseline and final scripted dinosaur shots scored **6,380 points**. Crowd,
UFO and confetti animation phases can vary between the captures.

# Graphics polish: composition, lighting and field

Implemented steps 1–3 of the agreed plan, using Blender 5.2.1 LTS.

## Changes

- Compact single-line target plaques replace the large stacked signs. Plaques
  avoid the HUD, clipped screen edges and other plaques. Only three stadium
  pavilions carry lettering. All five HUD statistics remain in a shorter panel.
- The foreground mascot gently fades during the dinosaur celebration, revealing
  the dinosaur without moving either target or changing its hit surfaces. The
  fade freezes on pause and returns to opaque for the next pitch.
- Reduced directional shadow contrast, brighter hemisphere fill, a cool fill
  light and shared soft contact shadows under shoes, bases and structures.
  The contact texture is generated locally at 64 × 64; no new shadow camera.
- Continuous clay paths centred on the original base diamond; subtler mowing
  stripes, a narrow worn grass margin, flat clay wear patches and broad grooming
  bands replace the tiny grooves and pebble speckles.

## Files

Rebuilt editable `assets/source/blender/field.blend` and `stadium.blend`, and
their matching GLBs in `public/assets/models/`. The reproducible source is
`assets/source/blender/build_assets.py`.

Render-only composition lives in `src/visual-polish.ts`, integrated by
`src/rendering.ts`. HUD styling is in `src/style.css`. The only addition to
`src/main.ts` is development-only composition diagnostics.

All seven GLBs now total **136,296 triangles**, **61 material batches** and
**6,354,708 bytes**. They contain no texture images or external dependencies.

## Verification

| Check | Result |
| --- | --- |
| `npm test` | 79 passed |
| `npm run build` | Passed |
| Full `npm run test:e2e` | 40 passed |
| Production keyboard scoring | Passed; scored 5,415 points |
| Production development hooks | Absent |
| Browser console errors | None |
| Local GLBs | All seven loaded successfully |
| Procedural fallbacks / slow loading | Passed |
| Plaques clear of HUD / paused fade / restored mascot | Passed |

SHA-256 checks confirm these files are byte-for-byte unchanged:
`physics.ts`, `pitching.ts`, `batting.ts`, `batter.ts`, `scoring.ts`, `state.ts`,
`types.ts`, and `target-shapes.ts`. The results are saved in
`artifacts/gameplay-hashes-polish-result.json`. Camera movement and framing
logic are unchanged, and the existing camera, input, target, scoring, pause,
versus and touch checks all pass. The scripted dinosaur shot scores **6,380**
both before and after this pass.

Existing non-failing toolchain notices: Rapier initialization deprecation in
unit tests and Vite's vendor-chunk size advisory.

## Performance and images

At 1440 × 900 on the Radeon 880M laptop using Chromium/ANGLE D3D11:

- Baseline park capture: 60 FPS, p95 16.8 ms.
- Polished park capture: 60 FPS, p95 16.8 ms.
- Production active play: 58 FPS, p95 17 ms (browser regression running concurrently).

These are measurements on this laptop. The pixel ratio cap, shadow resolution
and shadow update cadence remain unchanged.

`polish-before/` and `polish-after/` contain the gameplay screenshots and raw
reports. `polish-after/dinosaur-focus.png` shows the settled mascot fade.
`polish-comparison.html` is the full gallery; `polish-comparison-batting.png`
and `polish-comparison-dinosaur.png` are the comparison rows.
`polish-production-report.json` and `polish-production-play.png` preserve the
built-game verification. The previous visual-slice gallery remains untouched.

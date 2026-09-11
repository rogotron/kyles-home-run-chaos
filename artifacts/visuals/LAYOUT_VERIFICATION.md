# Stadium layout correction — 11 September 2026

The chalk now lies on the field and leads to the two real foul poles. The
previous Blender link helper changed rotation mode after assigning a
quaternion, which reset the long chalk cylinders to upright. Flat painted
ribbons replace those cylinders, and the helper now sets rotation mode first.

## Geometry and visual layout

- Home plate is the field origin. The foul rays follow X = ±Z through first
  and third base, ending at the 72-metre outfield wall.
- Pole bases are (±50.911688, 0, 50.911688). Masts are 24 metres tall and
  0.28 metres wide, with a new bright yellow shared material and mirrored,
  narrow open screens. Their bases sit within the padded wall thickness.
- The editable Blender field and stadium were regenerated with Blender
  5.2.1 LTS. Playwright inspected the actual exported GLB vertex positions:
  chalk Y is 0.082 and both line endpoints match the pole bases to 1 mm.
- Seating uses radii 122/132/142 metres, leaving the attraction court clear.
  Crowd members, canopies, signs, floodlights, trees and the distant skyline
  occupy progressively deeper zones. No attraction was removed.
- The mascot occupies a separate bay and remains opaque. The pizza truck
  and inflatable baseball have separate ground footprints and clear foul-pole
  sightlines. The hot dog sits below the UFO's moving airspace.
- The scoreboard is shifted and narrowed from 34 to 28 metres; its display
  and Rapier surface follow that width. The hittable light tower has its own
  bay and a grounded mast. Target aiming, render anchors and colliders use
  the same position definitions in `src/types.ts`.
- Camera positions, follow interpolation, zoom timing and reactions are
  retained. Responsive FOV includes the foul corners; short windows use an
  off-axis frame to reserve room for the existing HUD.
- Target plaques choose nearby empty screen positions, avoid other labels,
  target silhouettes, poles, major background structures and the HUD, and
  render above scene geometry. All ten labels are visible in the normal
  1440 × 900 batting capture. Crowded camera views suppress a plaque when
  no nearby clear position exists.

## Verification

- `npm test`: **79 passed**, including real Rapier collisions at different
  pitch locations and unassisted legal batting profiles for every target.
- `npm run build`: **passed**.
- **55 distinct Playwright checks verified.** The full run passed 51 checks;
  four keyboard fixtures still aimed at the moved targets' former positions.
  After updating those fixture coordinates, the complete 15-test target
  suite passed. No aiming or batting implementation was changed to satisfy
  those checks.
- The 15 new layout checks cover 1280 × 720, 1440 × 900, 1920 × 1080 and
  1024 × 768, exported foul geometry, and all ten target camera tours from
  flight through reaction and return. Each tour checks label boundaries
  every 200 ms, captures frames every 600 ms, and resizes during flight.
- Existing tests also verify keyboard/mouse/touch controls, pauses, ten-pitch
  rounds, golden pitches, scoring, target reactions, asset loading, fallback
  models, and batting contact alignment.
- Final graphics capture: **59.6 FPS**, 95th-percentile frame time **16.8 ms**
  on Radeon 880M hardware acceleration, with no console errors and all seven
  local GLBs loading successfully. The unchanged dinosaur shot scores 6,380.
- `src/physics.ts`, `src/pitching.ts`, `src/batting.ts`, `src/batter.ts`,
  `src/scoring.ts`, `src/state.ts`, `src/ui.ts`, `src/audio.ts` and
  `src/effects.ts` are unchanged. Scoring formulas and target bonuses remain
  the same; moved targets naturally require their new aiming directions.

## Files and reproduction

Updated editable sources: `assets/source/blender/field.blend` and
`assets/source/blender/stadium.blend`.

Updated exports: `public/assets/models/field.glb`,
`public/assets/models/stadium.glb` and `public/assets/models/manifest.json`.
All other original Blender sources and exports remain in place. No downloaded
assets, textures or runtime services were introduced.

The reproducible generator is `assets/source/blender/build_assets.py`, with
shared field dimensions in `src/stadium-layout.json`.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python assets/source/blender/build_assets.py -- field stadium
npm test
npm run build
npm run test:e2e
node scripts/check-reachability.mjs --unassisted
node scripts/capture-visuals.mjs layout-after
node scripts/review-stadium-layout.mjs
node scripts/render-comparison.mjs layout-comparison
```

See [before-and-after comparison](layout-comparison.html),
[baseline capture](layout-before/report.json), and
[final capture](layout-after/report.json). The `layout-after/tour-*.png`
contact sheets preserve the ten complete camera tours, including resizing.

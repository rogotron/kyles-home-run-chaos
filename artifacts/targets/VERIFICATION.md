# Stadium target asset verification

Ten original Blender targets integrated and visually reviewed on September 12, 2026.
The code inventory includes dinosaur, toilet, hot dog, soccer goal, UFO, scoreboard,
light tower, inflatable baseball, wobbly mascot and pizza truck.

## Deliverables

- [Editable Blender gallery](../../blender/stadium-targets.blend)
- [Reproducible bpy generator](../../blender/create_stadium_targets.py)
- [Individual GLBs and manifest](../../public/assets/targets/)
- [Gameplay-camera preview sheet](preview-sheet.png)
- [Before/after comparison](comparison.png)
- [Baseline measurements](before/report.json) and [final measurements](after/report.json)

## Asset budget

72,788 triangles, 43 material primitives,
3.26 MiB total GLB data, zero image textures.
Primitives are counted from actual exported glTF meshes, not source object counts.

| Asset | Triangles | Material primitives | File size |
| --- | ---: | ---: | ---: |
| dinosaur | 14,440 | 3 | 491 KiB |
| toilet | 5,076 | 4 | 219 KiB |
| hotdog | 4,688 | 3 | 156 KiB |
| goal | 1,552 | 3 | 89 KiB |
| ufo | 7,232 | 15 | 263 KiB |
| scoreboard | 6,160 | 3 | 468 KiB |
| lights | 9,384 | 2 | 617 KiB |
| baseball | 6,100 | 3 | 234 KiB |
| mascot | 7,176 | 3 | 254 KiB |
| pizza | 10,980 | 4 | 544 KiB |

Shared linear vertex colors preserve the palette while batching by animation
pivot and surface response. All materials are glTF metallic/roughness-compatible,
opaque and single-sided. The dome is glossy tinted solid geometry; net cords
are actual sparse geometry. The original transparent UFO beam remains unchanged.
Export validation checks self-contained buffers, zero textures, vertex colors,
unit normals, identity root pivots, dinosaur articulation and geometry budgets.

## Before/after performance

| Viewport | Whole-frame triangles | Whole-frame draw calls | Measured FPS | p95 frame interval |
| --- | ---: | ---: | ---: | ---: |
| 1440 × 900 | 225,909 → 261,225 | 1,188 → 1,120 | 60.0 → 60.0 | 16.80 → 16.80 ms |
| 390 × 844 | 197,899 → 233,543 | 702 → 678 | 60.0 → 60.0 | 16.80 → 16.80 ms |

GPU: ANGLE (AMD, AMD Radeon(TM) 880M Graphics (0x0000150E) Direct3D11 vs_5_0 ps_5_0, D3D11).
Each sample uses 180 real requestAnimationFrame intervals after 30 warm-up
frames, before enabling the virtual clock. The FPS sample is the animated menu
scene; triangle/draw counters are from the batting camera after starting a round.
Whole-frame counters include the existing crowd, stadium and effects. Frame
intervals stayed at the display's approximately 60 Hz cap despite added detail;
draw calls decreased. This is a desktop GPU with desktop/mobile viewport sizes,
not a benchmark on a physical phone or a GPU timer measurement.

## Gameplay and visual checks

- Every GLB returned successfully and every target's imported geometry was
  confirmed attached, independently of the loader's success flag.
- All ten targets were hit in both viewport sizes; each produced exactly one
  settled hit and the same score as the pre-change version.
- Original target surface objects are retained and invisible. Rapier shapes,
  transforms, scoring, target identifiers, labels and layout are unchanged.
- The live scoreboard CanvasTexture remains in Three.js; the frame GLB contains
  no baked text or score. Frame flashes and lamp dimming use the existing drivers.
- Head/jaw motion, UFO bulbs, flush swirl, mascot wobble, inflatable deflation,
  tether hiding and reset, pizza slices, ducks, paper and splashes remain connected
  to the original reaction loops. New tethers reach the elevated props.
- Reviewed full desktop/mobile batting, approach and reaction screenshots.
  Corrected the initially buried UFO bulbs and replaced name-based attachment
  checks with semantic extras so scoreboard and tower load reliably.
- The camera is unchanged, including its existing portrait-mode cropping of
  outer targets in the batting view; those targets are shown during approach.
- Missing and corrupt target files retain their procedural objects and remain
  playable. Unaffected files continue to load normally.

## Regression checks

- 79 gameplay unit tests passed.
- 24 browser regression tests passed, covering all GLB contracts, desktop/mobile attachment,
  corrupt/missing-file fallback, contact alignment, golden-ball appearance,
  slow loading, scoring, keyboard-assisted hits, reactions, pause and resets.
- Production build checked with TypeScript and Vite. Real keyboard play scored
  2,675 points with no console errors, no development hooks and 60 FPS
  (17 ms p95). See production-report.json.
- Git comparison confirmed no changes in: `src/physics.ts`, `src/target-shapes.ts`, `src/types.ts`, `src/stadium-layout.json`, `src/scoring.ts`, `src/batting.ts`, `src/batter.ts`, `src/pitching.ts`, `src/visual-polish.ts`, `src/ui.ts`, `src/style.css`, `src/models.ts`, `src/effects.ts`, `src/audio.ts`, `public/assets/models`.
  Rendering changes are limited to calling the target upgrade helper. Main.ts
  adds development-only inspection data; game-loop and camera code are unchanged.

The original seven-model generation workflow and its source files are retained.
The older dinosaur GLB is no longer requested; the new target set supplies it.

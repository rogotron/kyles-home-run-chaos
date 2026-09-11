# Chaos Park art sources

Seven original assets made with Blender **5.2.1 LTS**. No downloaded models,
textures, team branding, or external runtime resources are used.

Rebuild all assets from the project root in PowerShell:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python assets/source/blender/build_assets.py
```

Append `-- stadium` to rebuild just the stadium (or use the function names
`field`, `batter`, `bat`, `baseball`, `plate`, `dinosaur`). The script saves
editable individual parts before applying modifiers and merging export meshes.
The `.blend` files retain named parts, curves, typography, shared materials,
rounded-edge modifiers and animation pivots.

| Editable source | Export in `public/assets/models/` | Purpose |
| --- | --- | --- |
| `field.blend` | `field.glb` | Subtle mowing stripes, continuous clay paths, grooming bands, chalk, mound and bases |
| `stadium.blend` | `stadium.glb` | Padded fence, terraces, striped pavilions, pennants and floodlights |
| `batter.blend` | `batter.glb` | Rounded uniform, shoes, gloves, expressive face and helmet |
| `bat.blend` | `bat.glb` | Maple barrel, grain, wrapped grip and safety knob |
| `baseball.blend` | `baseball.glb` | Leather shell, curved seams and raised stitches |
| `home-plate.blend` | `home-plate.glb` | Beveled five-sided rubber plate |
| `dinosaur.blend` | `dinosaur.glb` | Friendly muzzle, eyes, belly, tiny arms, tail and articulated jaw |

`public/assets/models/manifest.json` records actual triangle counts, material
batches and file sizes. All seven assets have **zero image textures**. Static
stadium pieces merge into seven material batches; moving pieces batch per pivot.

## Coordinates and animation

The Python helpers accept Three.js coordinates in metres: X across the field,
Y up, Z toward the outfield. They convert to Blender `(x, -z, y)`. The exporter
converts back to glTF Y-up. A game Y rotation becomes a Blender Z rotation.

- Batter `Head`: `(0, 1.93, 0)`; `Arm`: `(0.42, 1.5, 0)`.
- Bat is local Y-up, with barrel contact at `(0, 1.1, 0)`. The existing bat
  pivot, stance, swing code and Rapier capsule stay in charge.
- Dinosaur `Head`: `(0, 16, 0)`; `Jaw`: `(0, -2, -0.3)` relative to the head.
  The existing reaction updates the imported head and jaw directly.
- Field origin and home plate are `(0, 0, 0)`; mound remains at Z=18.
- Fence radius remains 72, with the original 52 bay positions and rotations.

No collider meshes are included. `src/physics.ts` and `src/target-shapes.ts`
continue to own the existing Rapier geometry independently of render detail.

## Runtime integration

`src/visual-assets.ts` loads same-origin GLBs with `GLTFLoader.parseAsync`.
Assets load concurrently with Rapier initialization under the startup overlay.
The renderer compiles the assembled scene and renders a warm-up frame before
the overlay is removed. A failed or timed-out asset keeps its procedural
fallback for that session; no later model swap occurs during gameplay.

Existing crowd animation, other targets, scoreboard, camera movement, contact
timing and ball halo remain. The ball leather material still turns gold on
pitches 9 and 10. Lighting uses a warm directional key, cooler hemisphere and
directional fill, gentler shadow intensity and pale distance fog. A shared
64px procedural alpha texture supplies soft contact shadows under shoes, bases
and structures. Pixel-ratio cap, 2048 shadow map and amortized shadow updates
are retained; no additional shadow cameras are needed.

`src/visual-polish.ts` places compact single-line target plaques below the
target faces, excludes the HUD and screen edges, and suppresses overlapping
plaques. The HUD retains all five statistics in a shorter footprint. Stadium
lettering appears on three pavilions instead of all thirteen. During the
dinosaur reaction only, the foreground mascot fades to reveal the dinosaur;
its geometry, position and Rapier surfaces are unchanged. This visual fade
freezes on pause and returns to opaque for the next pitch.

The field's diamond is centred on Z=12.7, aligning its continuous clay paths
with the original base coordinates. Fine grooves and pebble speckles were
replaced by broad grooming bands and flat clay wear patches.

## Verification and screenshots

Run `npm test`, `npm run build` and `npm run test:e2e`.
The visual asset Playwright tests cover local-only loading, binary self-containment,
geometry budget, slow startup, procedural fallbacks, contact alignment and gold
coloring. Existing browser tests cover scoring, targets, camera and touch input.

`node scripts/capture-visuals.mjs after` captures the live game and GPU timings.
The preserved `artifacts/visuals/before/` captures were taken before integration.
`node scripts/render-comparison.mjs` creates the comparison image from the actual
screenshots. Open `artifacts/visuals/comparison.html` to compare full-size views.

For the subsequent composition, lighting and field pass, use
`node scripts/capture-visuals.mjs polish-after` and
`node scripts/render-comparison.mjs polish-comparison`.
`artifacts/visuals/polish-before/` preserves the first Blender slice before
that pass. `polish-after/dinosaur-focus.png` also shows the settled cutaway.

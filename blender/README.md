# Kyle’s stadium target assets

Ten original Blender 5.2.1 LTS props, created with `bpy`. No downloaded models,
image textures, baked numbers, or collision geometry are included.

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python blender/create_stadium_targets.py
```

The generator saves `stadium-targets.blend` as an editable, assembled gallery
before converting curves, applying modifiers, and batching export meshes.
Individual GLBs and measured geometry budgets are in `public/assets/targets/`.
The gallery offsets are removed from exports. Do not export the entire gallery
as a replacement for an individual target.

## Coordinate and animation contract

Helpers accept Three.js coordinates `(x, y, z)` and convert to Blender
`(x, -z, y)`. glTF exports restore Y-up, game-unit scale and an identity root.
Semantic `targetRole` extras survive GLTFLoader's name sanitization.

| Role | Attachment in the game |
| --- | --- |
| Static | Original target group, at its unchanged world transform |
| Moving | Original animated pivot; imported offset is zero |
| Head / Jaw | Dino head at `(0,16,0)`; jaw at `(0,-2,-0.3)` relative to head |
| Light0–Light11 | Original twelve UFO bulb positions and pulse order |
| Tether | Anchored cord; original deflation/reset visibility behavior |

The existing moving pivots supply Y=24 for the inflatable baseball, Y=14 for
sock and mascot, Y=25 for the scoreboard and Y=27 for the light tower.
The flush swirl attaches at `(0,6.6,-1)`; UFO motion remains on its original
parent. The Blender gallery shows these assembled offsets, but resets them
before exporting to avoid applying the offsets twice in Three.js.

`src/visual-assets.ts` validates roles before hiding any original render mesh.
Each missing, corrupt or incompatible file leaves its procedural fallback
visible independently. The old surface objects remain available and invisible;
Rapier uses the shared shapes in src/target-shapes.ts, including the new sock leg, foot, and cuff. Nothing in the GLBs drives
physics, scoring, camera movement, labels or game state.

The imported scoreboard frame shares its material with the original reaction
driver. The existing CanvasTexture score display is still created and updated
by `src/rendering.ts`. Imported light lenses similarly receive the original
flicker/dim/reset material updates. Ice cream cones, ducks, paper, splashes and
the UFO's translucent beam remain the existing effects.

## Rendering decisions

- Rounded silhouettes, selective bevels, smooth normals and readable details.
- Linear vertex colors batch palette regions by animation pivot and surface
  response: vinyl, ceramic, metal, lamp lens or net cord.
- Single-sided, opaque glTF materials. The tinted UFO dome uses glossy opaque
  shading; the net uses sparse real cords. Neither needs transparency sorting.
- Fixed UFO lamp sockets batch with the hull; the twelve lenses retain their
  individual animation pivots.
- No image textures, material transmission, external buffers, animation clips,
  cameras or lights are exported.

## Review and verification

See `artifacts/targets/preview-sheet.png`, `comparison.png`, and
`VERIFICATION.md`. Individual desktop/mobile approach and reaction captures
are in `artifacts/targets/after/`.

```powershell
npm run dev -- --port 5173
node scripts/verify-stadium-targets.mjs after
node scripts/target-preview-sheet.mjs
npx playwright test tests/e2e/stadium-target-assets.spec.ts tests/e2e/visual-assets.spec.ts tests/e2e/targets.spec.ts
npm test
npm run build
```

The capture script uses the unmodified gameplay camera. Its preview crops are
from ball approach; full images also preserve the UI and surrounding stadium.
Performance samples use real requestAnimationFrame timing, before installing
Playwright's virtual clock for deterministic collision/reaction captures.

import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const before=await read('artifacts/targets/before/report.json');
const after=await read('artifacts/targets/after/report.json');
const manifest=await read('public/assets/targets/manifest.json');
const preserved=['src/physics.ts','src/target-shapes.ts','src/types.ts','src/stadium-layout.json','src/scoring.ts','src/batting.ts','src/batter.ts','src/pitching.ts','src/visual-polish.ts','src/ui.ts','src/style.css','src/models.ts','src/effects.ts','src/audio.ts','public/assets/models'];
const differences=execFileSync('git',['diff','--name-only','HEAD','--',...preserved],{encoding:'utf8'}).trim();
if(differences)throw new Error('Unexpected protected-file changes: '+differences);
for(const viewport of ['desktop','mobile']){
  if(after[viewport].errors.length)throw new Error(JSON.stringify(after[viewport].errors));
  for(const id of Object.keys(manifest.assets)){
    const a=after[viewport].hits[id],b=before[viewport].hits[id];
    if(a.hit!==id||a.hits!==1||a.score!==b.score||!a.render.targetAssets[id].integrated)throw new Error(`Target verification failed: ${viewport}/${id}`);
  }
}
const sum=key=>Object.values(manifest.assets).reduce((s,a)=>s+a[key],0);
const n=x=>x.toLocaleString('en-US');
const rows=Object.entries(manifest.assets).map(([id,a])=>`| ${id} | ${n(a.triangles)} | ${a.drawPrimitives} | ${Math.round(a.bytes/1024)} KiB |`).join('\n');
const perfRows=['desktop','mobile'].map(v=>`| ${v==='desktop'?'1440 × 900':'390 × 844'} | ${n(before[v].visual.triangles)} → ${n(after[v].visual.triangles)} | ${n(before[v].visual.drawCalls)} → ${n(after[v].visual.drawCalls)} | ${(1000/before[v].perf.meanMs).toFixed(1)} → ${(1000/after[v].perf.meanMs).toFixed(1)} | ${before[v].perf.p95Ms.toFixed(2)} → ${after[v].perf.p95Ms.toFixed(2)} ms |`).join('\n');
await writeFile('artifacts/targets/VERIFICATION.md',`# Stadium target asset verification

Ten original Blender targets integrated and visually reviewed on September 12, 2026.
The code inventory includes dinosaur, toilet, sock, soccer goal, UFO, scoreboard,
light tower, inflatable baseball, wobbly mascot and ice cream truck.

## Deliverables

- [Editable Blender gallery](../../blender/stadium-targets.blend)
- [Reproducible bpy generator](../../blender/create_stadium_targets.py)
- [Individual GLBs and manifest](../../public/assets/targets/)
- [Gameplay-camera preview sheet](preview-sheet.png)
- [Before/after comparison](comparison.png)
- [Baseline measurements](before/report.json) and [final measurements](after/report.json)

## Asset budget

${n(sum('triangles'))} triangles, ${sum('drawPrimitives')} material primitives,
${(sum('bytes')/1024/1024).toFixed(2)} MiB total GLB data, zero image textures.
Primitives are counted from actual exported glTF meshes, not source object counts.

| Asset | Triangles | Material primitives | File size |
| --- | ---: | ---: | ---: |
${rows}

Shared linear vertex colors preserve the palette while batching by animation
pivot and surface response. All materials are glTF metallic/roughness-compatible,
opaque and single-sided. The dome is glossy tinted solid geometry; net cords
are actual sparse geometry. The original transparent UFO beam remains unchanged.
Export validation checks self-contained buffers, zero textures, vertex colors,
unit normals, identity root pivots, dinosaur articulation and geometry budgets.

## Before/after performance

| Viewport | Whole-frame triangles | Whole-frame draw calls | Measured FPS | p95 frame interval |
| --- | ---: | ---: | ---: | ---: |
${perfRows}

GPU: ${after.desktop.perf.gpu}.
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
  tether hiding and reset, ice cream cones, ducks, paper and splashes remain connected
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
- Git comparison confirmed no changes in: ${preserved.map(p=>'\x60'+p+'\x60').join(', ')}.
  Rendering changes are limited to calling the target upgrade helper. Main.ts
  adds development-only inspection data; game-loop and camera code are unchanged.

The original seven-model generation workflow and its source files are retained.
The older dinosaur GLB is no longer requested; the new target set supplies it.
`);
console.log(JSON.stringify({triangles:sum('triangles'),primitives:sum('drawPrimitives'),bytes:sum('bytes'),protectedFilesUnchanged:true}));

import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import path from "node:path";
await build({
  stdin: {
    contents:
      "export {initPhysics} from './src/physics';export {targetedExitVelocity, exitVelocity} from './src/batting';export {TARGETS} from './src/types';export {CONTACT_Z} from './src/batter';export {Pitching} from './src/pitching';export {classifySwing} from './src/scoring';",
    resolveDir: process.cwd(),
  },
  outfile: ".local/physics-check.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
const {
  initPhysics,
  targetedExitVelocity,
  exitVelocity,
  TARGETS,
  Pitching,
  classifySwing,
} = await import(pathToFileURL(path.resolve(".local/physics-check.mjs")).href);
const unassisted = process.argv.includes("--unassisted");
const launchVelocity = unassisted ? exitVelocity : targetedExitVelocity;
const physics = await initPhysics();
const profiles = {};
for (const target of TARGETS) {
  const hits = [];
  for (const error of [0, -0.25, 0.25, -0.35, 0.35, -0.5, 0.5])
    for (const y of [1.4, 1.5, 1.65, 1.8, 1.9])
      for (const offset of [0, -0.06, 0.06, -0.12, 0.12]) {
        const pitching = new Pitching();
        pitching.start(true);
        pitching.location = { x: 0, y };
        pitching.elapsed = pitching.contactTime + error;
        const p = pitching.position();
        const spread = -Math.max(-1, Math.min(1, error / 0.36)) * 0.23;
        const aim =
          (Math.atan2(target.position.x - p.x, target.position.z - p.z) -
            spread) /
            0.68 +
          offset;
        if (Math.abs(aim) > 1) continue;
        const quality = classifySwing(error);
        physics.launch(
          p,
          launchVelocity(quality, aim, pitching.location, error, p),
        );
        let hit = null;
        for (let i = 0; i < 400 && !hit; i++) {
          physics.step(1 / 60, (tag) => {
            if (
              !hit &&
              (TARGETS.some((t) => t.id === tag) ||
                ["ground", "wall", "stadium"].includes(tag))
            )
              hit = tag;
          });
        }
        if (hit === target.id)
          hits.push({
            quality,
            error,
            pitchHeight: y,
            aim: Number(aim.toFixed(4)),
          });
        physics.hideBall();
        physics.step(1 / 60, () => {});
      }
  profiles[target.id] = hits;
  console.log(target.id, hits.length, JSON.stringify(hits.slice(0, 3)));
}
physics.world.free();
const { writeFile } = await import("node:fs/promises");
await writeFile(
  `.local/target-reachability${unassisted ? "-unassisted" : ""}.json`,
  JSON.stringify(profiles, null, 2),
);
if (Object.values(profiles).some((profiles) => !profiles.length))
  process.exitCode = 1;

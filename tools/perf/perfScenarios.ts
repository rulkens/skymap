/**
 * perfScenarios — the named camera vantages the perf harness benchmarks.
 *
 * Each scenario is a regime of the powers-of-ten descent whose frame cost we
 * want to characterise independently: standing on Earth's surface, out among
 * the planets, in the parsec-scale star field, at Milky-Way galaxy scale, in
 * the Local Group, and zoomed out to the full survey. Frame cost is a function
 * of WHERE the camera is (how much geometry projects, how much fill each pass
 * touches), so a fixed pose per regime is what makes a run reproducible.
 *
 * ### Poses captured live via logState
 *
 * The six `pose` values below were captured by flying the running app to each
 * regime and reading the `l`-key `logState` one-liner — physical coordinates
 * invented at a desk would put the camera nowhere meaningful. Every capture kept
 * Earth as the orbit target while dollying out, so all six share the SAME
 * look-at point (`EARTH_TARGET` — Earth's J2000 heliocentric position, ~1 AU off
 * the origin) and differ only in `distance` plus a little yaw/pitch framing:
 * from Earth's surface (`8.9e-16` Mpc) out to the full survey (`12372` Mpc), the
 * ~30 scale-decades of the powers-of-ten descent. From `milky-way` outward the
 * camera is so far back that Earth's 1 AU offset from the Sun is far below one
 * pixel, so the shared Earth target is indistinguishable from the origin there.
 * `fovYRad` from the dump is the 60° default and not part of `PerfPose`, dropped.
 */

import type { PerfPose } from '../../src/@types/perf/PerfPose';
import type { Vec3 } from '../../src/@types/math/Vec3';

export type PerfScenario = { readonly name: string; readonly pose: PerfPose };

// The shared look-at point for every scenario: Earth (its J2000 heliocentric
// position, matching SCENE_EARTH.positionMpc — verified equal at capture time).
// Factored out so the six poses differ only in the axes that actually vary
// (distance/yaw/pitch) and the target can never drift between them.
const EARTH_TARGET: Vec3 = [-8.5895045e-13, 4.3022234e-12, 1.865304e-12];

export const PERF_SCENARIOS: readonly PerfScenario[] = [
  { name: 'earth-surface', pose: { target: EARTH_TARGET, distance: 8.9404154e-16, yaw: 1.3857, pitch: 0.7126 } },
  { name: 'solar-system', pose: { target: EARTH_TARGET, distance: 1.1343633e-10, yaw: 3.7281, pitch: 0.6638 } },
  { name: 'star-field', pose: { target: EARTH_TARGET, distance: 0.000089186628, yaw: 3.7281, pitch: 0.6638 } },
  { name: 'milky-way', pose: { target: EARTH_TARGET, distance: 0.011100341, yaw: 5.9423, pitch: 0.7802 } },
  { name: 'local-group', pose: { target: EARTH_TARGET, distance: 21.268361, yaw: 8.2811, pitch: 0.5612 } },
  { name: 'full-survey', pose: { target: EARTH_TARGET, distance: 12372.364, yaw: 5.8964, pitch: 0.0552 } },
];

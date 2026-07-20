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
 * ### Poses are PLACEHOLDERS awaiting live capture
 *
 * The six `pose` values below are compiling placeholders, NOT real coordinates.
 * The honest way to get a pose is to fly the running app to each regime and
 * read the `l`-key `logState` dump — physical coordinates invented at a desk
 * would put the camera nowhere meaningful. So each entry ships a trivially-valid
 * pose marked for replacement; the live-capture step pastes the real vantage in.
 */

import type { PerfPose } from '../../src/@types/perf/PerfPose';

export type PerfScenario = { readonly name: string; readonly pose: PerfPose };

// PLACEHOLDER — replace via logState live capture
const PLACEHOLDER_POSE: PerfPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 };

export const PERF_SCENARIOS: readonly PerfScenario[] = [
  { name: 'earth-surface', pose: PLACEHOLDER_POSE }, // PLACEHOLDER — replace via logState live capture
  { name: 'solar-system', pose: PLACEHOLDER_POSE }, // PLACEHOLDER — replace via logState live capture
  { name: 'star-field', pose: PLACEHOLDER_POSE }, // PLACEHOLDER — replace via logState live capture
  { name: 'milky-way', pose: PLACEHOLDER_POSE }, // PLACEHOLDER — replace via logState live capture
  { name: 'local-group', pose: PLACEHOLDER_POSE }, // PLACEHOLDER — replace via logState live capture
  { name: 'full-survey', pose: PLACEHOLDER_POSE }, // PLACEHOLDER — replace via logState live capture
];

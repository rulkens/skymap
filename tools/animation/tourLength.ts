/**
 * tourLength — print the static beat sheet + total wall time of a tour.
 *
 *   npm run tour-length              # every tour in the registry
 *   npm run tour-length -- grandTour # one tour
 *
 * A beat's wall time is its enter clip's compiled duration plus its dwell
 * clip's compiled duration — exactly what `visitBeatSaga` plays on
 * auto-advance. Durations are measured statically via `clipDurationSec`
 * (id-bearing cues stubbed duration-neutrally), so no catalog data is
 * needed. What this deliberately does NOT include: the per-beat readiness
 * gates (`waitUntil` on catalog foci — ~0 once data is loaded) and any
 * viewer interaction (skips, pauses).
 */

import { tourRegistry } from '../../src/data/animation/tours/tourRegistry';
import type { Tour } from '../../src/@types/animation/tour/Tour';
import { clipDurationSec } from '../utils/animation/clipDurationSec';

function fmtMinSec(sec: number): string {
  return `${Math.floor(sec / 60)}m ${(sec % 60).toFixed(0).padStart(2, '0')}s`;
}

function printTour(tour: Tour): void {
  console.log(`\n${tour.label} (${tour.id}) — ${tour.beats.length} beats`);
  console.log(` #  ${'beat'.padEnd(26)} ${'enter'.padStart(7)} ${'dwell'.padStart(7)} ${'total'.padStart(7)}`);
  let total = 0;
  tour.beats.forEach((beat, i) => {
    const enter = beat.enterClip ? clipDurationSec(beat.enterClip) : 0;
    const dwell = clipDurationSec(beat.dwellClip);
    total += enter + dwell;
    const title = beat.caption?.title ?? '(silent)';
    console.log(
      `${String(i).padStart(2)}  ${title.padEnd(26)} ${enter.toFixed(1).padStart(6)}s ${dwell.toFixed(1).padStart(6)}s ${(enter + dwell).toFixed(1).padStart(6)}s`,
    );
  });
  console.log(`    ${'TOTAL'.padEnd(26)} ${' '.repeat(16)}${total.toFixed(1).padStart(6)}s  (${fmtMinSec(total)})`);
}

const requested = process.argv[2];
if (requested !== undefined) {
  const tour = (tourRegistry as Record<string, Tour>)[requested];
  if (tour === undefined) {
    console.error(`Unknown tour '${requested}'. Known: ${Object.keys(tourRegistry).join(', ')}`);
    process.exit(1);
  }
  printTour(tour);
} else {
  for (const tour of Object.values(tourRegistry)) printTour(tour);
}

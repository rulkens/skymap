/**
 * RATE_LADDER — the sim clock's detented playback speeds, ascending.
 *
 * The clock steps through this fixed table rather than a continuous slider, so
 * every reachable speed is a round, human-legible interval ('1 min/s', not
 * '73.4 s/s'). Each entry's `simSecPerRealSec` is how many seconds of sim time
 * elapse per real second at that detent; `TimeState.rateIndex` indexes into
 * here. Sign is `TimeState.direction`, pause is `TimeState.paused` — neither is
 * a ladder entry, so every value below is a strictly positive magnitude and the
 * table is strictly ascending.
 *
 * ### Even stepping
 *
 * The detents are geometric midpoints of an older, coarser ladder's gaps,
 * rounded to the nearest round calendar unit — one substep dropped into each
 * gap so stepping feels ~uniform. The worst adjacent ratio is now ×10 (was
 * ×60), so a press-and-hold sweep from '1 s/s' to '10 yr/s' climbs at a roughly
 * even pace rather than lurching across a minute-to-hour chasm.
 *
 * ### Calendar-unit conventions
 *
 * A month and a year are not clean multiples of a day, so we use the Julian
 * conventions the ephemeris already assumes: a Julian year is 365.25 days
 * (31_557_600 s) and a Julian month is exactly one twelfth of that
 * (365.25 / 12 = 30.4375 days = 2_629_800 s). Their multiples ('3 mo/s',
 * '3 yr/s') carry the same convention forward. Week and below are exact.
 *
 * ### Extension point
 *
 * Galactic-scale steps ('1 Myr/s', '1 Gyr/s') append to the tail later; keeping
 * the ladder a single ordered table is what makes that a one-line addition
 * rather than a new code path.
 */

import type { RateLadderStep } from '../../@types/time/RateLadderStep';

export const RATE_LADDER: readonly RateLadderStep[] = [
  { label: '1 s/s', simSecPerRealSec: 1 },
  { label: '10 s/s', simSecPerRealSec: 10 },
  { label: '1 min/s', simSecPerRealSec: 60 },
  { label: '10 min/s', simSecPerRealSec: 600 },
  { label: '1 hr/s', simSecPerRealSec: 3_600 },
  { label: '6 hr/s', simSecPerRealSec: 21_600 },
  { label: '1 day/s', simSecPerRealSec: 86_400 },
  { label: '3 day/s', simSecPerRealSec: 259_200 },
  { label: '1 wk/s', simSecPerRealSec: 604_800 },
  { label: '2 wk/s', simSecPerRealSec: 1_209_600 },
  { label: '1 mo/s', simSecPerRealSec: 2_629_800 },
  { label: '3 mo/s', simSecPerRealSec: 7_889_400 },
  { label: '1 yr/s', simSecPerRealSec: 31_557_600 },
  { label: '3 yr/s', simSecPerRealSec: 94_672_800 },
  { label: '10 yr/s', simSecPerRealSec: 315_576_000 },
];

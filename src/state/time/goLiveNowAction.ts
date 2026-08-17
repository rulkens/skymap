/**
 * goLiveNowAction — build the `goLive` action for "snap to true now," the one
 * shape every caller that means *right now* was hand-assembling identically:
 * `goLive({ simDays: unixMsToJulianDays(Date.now()), nowMs: performance.now() })`.
 *
 * ### The invariant this states once
 *
 * `goLive`'s payload pairs TWO different clocks into one anchor (see
 * `timeSlice.ts`): `simDays` is the wall-clock JD (`Date.now()`, which can
 * jump — NTP, sleep/wake, DST) and `nowMs` is the monotonic clock `deriveSimDays`
 * measures elapsed real time against (`performance.now()`, which never jumps).
 * The two reads must name the SAME instant, or the anchor is skewed: a gap
 * between the `Date.now()` read and the `performance.now()` read becomes a
 * permanent offset between "where live claims to be" and "where the wall clock
 * actually is," baked into `anchor.realMs` and never corrected. Five call
 * sites open-coded this exact pairing with no test or comment stating why the
 * two reads had to be adjacent; any one of them could have drifted apart under
 * a routine edit with nothing to fail. Sampling both here, in one function
 * body, makes that drift structurally impossible instead of hoping five
 * copies stay in sync by inspection.
 *
 * ### A different invariant from `manualPausedAtActions`
 *
 * `enterManualPausedAt.ts`'s builder threads ONE `performance.now()` sample
 * through TWO action payloads (`setSimDays` then `pause`) so the second
 * reducer's re-anchor sees zero elapsed time. This builder instead combines
 * TWO different clocks into ONE payload. Same family — a builder that samples
 * a clock so the caller can't — but a different reason to exist; do not
 * merge the two or generalize one into the other.
 *
 * ### `goLive` itself is not superseded
 *
 * The raw action stays exported and dispatchable directly: it also serves
 * "go live at a supplied instant" — tests pin literal values
 * (`goLive({ simDays: 2451545, nowMs: 100 })`), and a hash-param `t` row or
 * similar could in principle restore live mode at a *specific* recorded
 * instant rather than the current one. This builder is only for the "right
 * now" callers; it takes no parameters precisely so it can never be handed a
 * stale or mismatched instant.
 */

import { goLive } from './timeSlice';
import { unixMsToJulianDays } from '../../utils/time/unixMsToJulianDays';

export function goLiveNowAction(): ReturnType<typeof goLive> {
  return goLive({ simDays: unixMsToJulianDays(Date.now()), nowMs: performance.now() });
}

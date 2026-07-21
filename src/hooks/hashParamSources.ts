/**
 * HASH_PARAM_SOURCES — the ordered table of hash params `useUrlSync` reads and
 * writes. Table order fixes the on-URL layout: `composeHashParams` emits values
 * in this order, so two identical states always produce byte-identical hashes.
 *
 * Only `focus` exists today. The write reuses `URL_HASH_FOR` (the FocusableTarget
 * → id-segment codec); the read reproduces the original single-param behaviour
 * exactly:
 *
 *   - a non-empty `focus=<id>`     ⇒ `requestFocus(id)`  (always, mount included)
 *   - an absent / empty `focus`    ⇒ `clearSelection()`  but ONLY on a hashchange
 *                                     (`isInitial === false`); the mount pass
 *                                     never clears, so a plain page load with no
 *                                     hash doesn't wipe a selection made elsewhere.
 *
 * The empty-value case (`focus=` with nothing after the `=`) is treated as absent
 * on purpose: the pre-seam read matched with `/^focus=(.+)$/`, whose `.+`
 * requires at least one character. `if (value)` reproduces that — an empty string
 * is falsy — so `focus=` still falls to the clear-on-hashchange arm.
 */

import type { HashParamSource } from '../@types/hooks/HashParamSource';
import { URL_HASH_FOR } from './urlHashFor';
import { requestFocus } from '../state/selection/requestFocus';
import { clearSelection } from '../state/selection/selectionSlice';
import { setSimDays, pause } from '../state/time/timeSlice';
import { julianDaysToUnixMs } from '../utils/time/julianDaysToUnixMs';
import { unixMsToJulianDays } from '../utils/time/unixMsToJulianDays';

const focusSource: HashParamSource = {
  key: 'focus',
  write: (input) => {
    if (input.focused === null) return null;
    // Table dispatch on the union tag: galaxy ids run the codec ladder (null
    // when non-encodable), structures/bodies/stars yield their own id token.
    // An empty id (non-encodable row) contributes no param, same as null.
    return URL_HASH_FOR[input.focused.type](input.focused) || null;
  },
  read: ({ value, isInitial, dispatch }) => {
    if (value) dispatch(requestFocus(value));
    else if (!isInitial) dispatch(clearSelection());
  },
};

/**
 * `t` — the sim-clock instant. A manual clock crystallizes its moment onto the
 * URL as an ISO 8601 UTC timestamp; a live clock writes nothing, so a bare URL
 * means "now, forever". A shared link is a specimen: opening one lands the clock
 * in manual mode, paused, at that instant.
 *
 * ── write ──
 * Only manual mode contributes a `t`. The value is the anchor's `simDays`
 * (the sim instant at the last re-anchor), converted JD → Unix-ms → ISO. We
 * serialize the anchor rather than a live-derived instant deliberately: it is a
 * pure function of the intent, so the write fires once per re-anchor (pause,
 * scrub, rate/direction change) and never per frame. Pause re-anchors, so
 * "pause, then share" freezes exactly the moment on screen.
 *
 * ── read ──
 * A parseable ISO string restores manual + paused at that instant: `setSimDays`
 * anchors the manual clock there, then `pause` freezes it. Both dispatches carry
 * the SAME `nowMs` so `pause`'s re-anchor sees zero elapsed real time and holds
 * the instant exactly (`deriveSimDays(now) === instant`). An absent, empty, or
 * unparseable value is a no-op — the clock stays live (bare-URL semantics), and
 * the engine's bootstrap `goLive` owns "now".
 */
const timeSource: HashParamSource = {
  key: 't',
  write: (input) => {
    if (!input.time || input.time.mode !== 'manual') return null;
    return new Date(julianDaysToUnixMs(input.time.anchor.simDays)).toISOString();
  },
  read: ({ value, dispatch }) => {
    if (!value) return;
    const unixMs = Date.parse(value);
    if (Number.isNaN(unixMs)) return;
    // One `nowMs` for both dispatches: `setSimDays` pins the anchor's `realMs`
    // to it, so `pause`'s re-anchor derives zero elapsed and freezes the exact
    // instant. Two `performance.now()` reads would drift the paused value.
    const nowMs = performance.now();
    dispatch(setSimDays({ simDays: unixMsToJulianDays(unixMs), nowMs }));
    dispatch(pause({ nowMs }));
  },
};

export const HASH_PARAM_SOURCES: readonly HashParamSource[] = [focusSource, timeSource];

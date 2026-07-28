/**
 * HASH_PARAM_SOURCES — the ordered table of hash params `useUrlSync` reads and
 * writes. Table order fixes the on-URL layout: `composeHashParams` emits values
 * in this order, so two identical states always produce byte-identical hashes.
 *
 * The `focus` write reuses `URL_HASH_FOR` (the FocusableTarget → id-segment
 * codec); the read makes a URL arrival look like a scene click plus a fly:
 *
 *   - a non-empty `focus=<id>`     ⇒ `requestSelect(id)` (pins the InfoCard) +
 *                                     `requestFocus(id)` (flies the camera),
 *                                     always, mount included
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
import { requestSelect } from '../state/selection/requestSelect';
import { clearSelection } from '../state/selection/selectionSlice';
import { setOrientation } from '../state/settings/settingsSlice';
import { enterManualPausedAt } from '../state/time/enterManualPausedAt';
import { julianDaysToUnixMs } from '../utils/time/julianDaysToUnixMs';
import { isOrientationFrameId } from '../utils/url/isOrientationFrameId';
import { DEFAULT_ORIENTATION } from '../data/defaults';
import { EARTH_REF } from '../data/selection/earthRef';

const focusSource: HashParamSource = {
  key: 'focus',
  write: (input) => {
    // An in-flight request outranks the resolved slot. `requestFocus` for a
    // galaxy or star parks inside `resolveFocusRefDeferring` until its catalog
    // pulses, and the resolved slot stays null for that whole window — long
    // enough for the write effect to run and compose a hash with no `focus` at
    // all. The pending id is the very string the read handed to `requestFocus`,
    // so republishing it is byte-identical to the URL that arrived.
    //
    // The home-is-a-bare-URL rule below survives this: the Earth seed writes its
    // ref directly (`wireInput`'s `updateSelectionFocus(EARTH_REF)`), never as a
    // request, so a plain load has no pending id to publish.
    if (input.pendingFocusId !== null) return input.pendingFocusId;
    if (input.focused === null) return null;
    // Earth is the boot 'home' state: `wireInput` seeds it into focus so the
    // camera frames Earth, but home is the canonical EMPTY URL. Like the
    // `orientation` source's DEFAULT_ORIENTATION and the `t` source's live mode,
    // the home target composes no param, so a fresh load stays a bare URL.
    // Compared against EARTH_REF (the one home declaration) rather than a literal
    // so the omit rule can't drift from the seed. The read is unchanged, so an
    // explicit `body-earth` from an old shared link still resolves on arrival.
    // The `EARTH_REF.type === 'body'` clause is a discriminant narrow (always
    // true) that lets TS reach `.id` on both tagged unions.
    if (
      input.focused.type === 'body' &&
      EARTH_REF.type === 'body' &&
      input.focused.id === EARTH_REF.id
    ) {
      return null;
    }
    // Table dispatch on the union tag: galaxy ids run the codec ladder (null
    // when non-encodable), structures/bodies/stars yield their own id token.
    // An empty id (non-encodable row) contributes no param, same as null.
    return URL_HASH_FOR[input.focused.type](input.focused) || null;
  },
  read: ({ value, isInitial, dispatch }) => {
    if (value) {
      dispatch(requestSelect(value));
      dispatch(requestFocus(value));
    } else if (!isInitial) dispatch(clearSelection());
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
 * A parseable ISO string restores manual + paused at that instant via
 * `enterManualPausedAt` (the shared operation the date-entry popover commit also
 * uses; the shared-`nowMs` invariant that holds the instant exactly lives there).
 * An absent, empty, or unparseable value is a no-op — the clock stays live
 * (bare-URL semantics), and the engine's bootstrap `goLive` owns "now".
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
    enterManualPausedAt(dispatch, new Date(unixMs));
  },
};

/**
 * `orientation` — which astronomical pole the camera treats as "up". A view
 * preference, not a navigational target: the share link should reproduce the
 * composition the author saw.
 *
 * ── write ──
 * Only a non-default frame contributes a param, so a bare URL means "the default
 * orientation" and the common case adds no bytes. Comparing against
 * `DEFAULT_ORIENTATION` (not a hard-coded literal) keeps the omit-when-default
 * rule tied to the one place the default is declared.
 *
 * ── read ──
 * The value is routed through `isOrientationFrameId` before dispatch — the hash
 * is external input and could carry a hand-typed junk frame. A recognised frame
 * SNAPS via `setOrientation`; it deliberately does NOT `startFrameTween`, so a
 * shared link reproduces the composition instantly with no slerp on arrival.
 */
const orientationSource: HashParamSource = {
  key: 'orientation',
  write: (input) => (input.orientation === DEFAULT_ORIENTATION ? null : input.orientation),
  read: ({ value, dispatch }) => {
    if (value && isOrientationFrameId(value)) dispatch(setOrientation(value));
  },
};

// Append-only ordering: `composeHashParams` emits in table order, so appending
// `orientation` after `focus`, `t` keeps existing deep links byte-stable.
export const HASH_PARAM_SOURCES: readonly HashParamSource[] = [
  focusSource,
  timeSource,
  orientationSource,
];

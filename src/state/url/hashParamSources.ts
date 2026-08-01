/**
 * HASH_PARAM_SOURCES — the ordered table of `window.location.hash` params. One
 * row per param, owning everything about it: its key, whether its presence
 * counts as a deep link, which dispatched actions can change its serialized
 * value, how to write that value out of the store, and how to read a present or
 * absent value back into actions.
 *
 * Table order fixes the on-URL layout — the body is composed in this order — so
 * two identical states always produce byte-identical hashes, and the table is
 * APPEND-ONLY: a new row goes at the end so links already in the wild keep
 * parsing to the same bytes they were shared as.
 *
 * ### The `writesOn` completeness contract
 *
 * Every action that can change a row's `write` output MUST be covered by that
 * row's `writesOn`, or the URL goes stale until the next covered action fires.
 *
 * The failure is SELF-HEALING, and that is precisely why prose discipline is
 * the guard here rather than a runtime drift detector: the write recomposes the
 * entire hash body from current state, so a missed trigger never publishes a
 * wrong URL — it publishes the right one late, and the next focus, clock, or
 * orientation change repairs it. A detector would have to already know the full
 * set of actions that can move each `write`'s output, which is the very thing
 * these lists state; it would be the same claim asserted twice, with the second
 * copy free to drift.
 *
 * ### How wide a trigger should be
 *
 * A row's `writesOn` is a list of predicates over an action, so "a whole slice"
 * and "these three actions" are the same shape and a row can mix them. What
 * varies is how wide each predicate is allowed to be, and that turns on what
 * else lives in the slice it covers:
 *
 *  - `t` takes a slice PREFIX. Every `time/*` action is clock intent and
 *    re-anchors the sim instant, so the whole slice genuinely is the trigger
 *    set — and a prefix is drift-proof by construction, covering a seventh time
 *    reducer for free with no edit here. Prefer this width wherever the slice
 *    carries no hot stream.
 *  - `focus` and `orientation` name their actions, because their slices DO carry
 *    hot streams. A `selection/*` prefix would fire on `updateSelectionHover`,
 *    which the hover pick driver dispatches once per GPU pick readback for as
 *    long as the pointer keeps moving; a `settings/*` prefix would fire on every
 *    frame of a slider drag. Neither would push a history entry — `writeHashBody`
 *    compares against the live URL and skips an identical body — but each would
 *    drag a full state read, a table walk, a string compose and a
 *    `location.hash` read onto a pointer-rate path to republish a value that did
 *    not change. The write saga's coalescing does not cover for a wide trigger
 *    here: its window is one macrotask, which is shorter than the gap between
 *    two pointer events, so a stream of them still composes once apiece.
 *
 * `focus` narrows one step further, to `setSelectionRow` FOR THE FOCUS SLOT.
 * That action is the sole writer of all three derived rows, and the row's
 * `write` reads exactly one of them (`selectionRows.focus`, via
 * `selectFocusedFocusable`) — so the hover and select slots re-admit through the
 * derived cache precisely the pointer-rate stream the named-action list exists
 * to keep out. Slot-blind, the list would be a `selection/*` prefix wearing a
 * disguise.
 *
 * Naming `setSelectionRow` at all — rather than the actions upstream of it — is
 * what keeps this list short: every resolution path (a late catalog pulse, the
 * star-count pulse, a direct ref write) funnels through the reconciler and comes
 * out as that one action, so the upstream actions need no listing of their own.
 *
 * ### `readAbsent` is not uniformly pure
 *
 * `t`'s samples the wall clock, because "no instant on the URL" means "now" and
 * only the clock knows what now is. The asymmetry is accepted rather than
 * papered over by threading a clock parameter through the two rows that would
 * never read it.
 */

import type { Action } from '@reduxjs/toolkit';

import type { HashParamSource } from '../../@types/state/url/HashParamSource';
import { URL_HASH_FOR } from '../../services/url/urlHashFor';
import { requestFocus } from '../selection/requestFocus';
import { requestSelect } from '../selection/requestSelect';
import { clearSelection } from '../selection/selectionSlice';
import { selectFocusedFocusable, selectPendingFocusId } from '../selection/selectors';
import { setSelectionRow } from '../selectionRows/selectionRowsSlice';
import { selectOrientation } from '../settings/selectors';
import { setOrientation } from '../settings/settingsSlice';
import { manualPausedAtActions } from '../time/enterManualPausedAt';
import { goLiveNowAction } from '../time/goLiveNowAction';
import { selectTimeState } from '../time/selectors';
import { timeRoute } from '../../store/constants';
import { DEFAULT_ORIENTATION } from '../../data/defaults';
import { EARTH_REF } from '../../data/selection/earthRef';
import { julianDaysToUnixMs } from '../../utils/time/julianDaysToUnixMs';
import { isOrientationFrameId } from '../../utils/url/isOrientationFrameId';

/**
 * The `focus` row's third trigger: the derived-cache write, narrowed to the ONE
 * slot the row reads. Module-scope rather than a `utils/` file because it is not
 * a general predicate — it encodes which slot this particular row's `write`
 * depends on, so it belongs beside that `write` and beside the docblock that
 * justifies the narrowing, where a change to either is visibly a change to both.
 */
const isFocusSlotRow = (action: Action): boolean =>
  setSelectionRow.match(action) && action.payload.slot === 'focus';

/**
 * `focus` — the selected/framed target. The write reuses `URL_HASH_FOR` (the
 * FocusableTarget → id-segment codec); the read makes a URL arrival look like a
 * scene click plus a fly, which is why it returns TWO actions:
 * `requestSelect(id)` pins the InfoCard and `requestFocus(id)` flies the camera.
 *
 * Absence clears the selection — but only on a hashchange, which the reading
 * pass enforces by never calling `readAbsent` on the boot read. A plain load
 * with no hash therefore cannot wipe a selection the engine seeded.
 */
const focusSource: HashParamSource = {
  key: 'focus',
  deepLink: true,
  writesOn: [requestFocus.match, clearSelection.match, isFocusSlotRow],
  write: (state) => {
    // An in-flight request outranks the resolved slot — precedence, not
    // fallback. `requestFocus` for a galaxy or star parks inside
    // `resolveFocusRefDeferring` until its catalog pulses, and the resolved slot
    // stays null for that whole window; a write landing there would compose a
    // body with no `focus` at all and push the deep link away. The pending id is
    // the very string the read handed to `requestFocus`, so republishing it is
    // byte-identical to the URL that arrived. Reading it FIRST also keeps a
    // focus switch honest: falling back instead would republish the OLD target
    // until the new one resolved, so Back would land on a URL that never
    // matched the screen.
    //
    // The ladder is only ever read at rest. `watchHashWriteSaga` composes on the
    // trailing edge of a burst, so `write` never sees a request part-way through
    // resolving: both rungs are quiet and the resolved slot below is the answer.
    // That is what makes the two-rung form safe rather than the rungs happening
    // to meet — `clearSelection` in particular nulls `pending` in its reducer
    // while `selectionRows.focus` survives until the reconciler runs, and no
    // arrangement of this ladder closes that gap. See
    // `tests/state/url/hashHistoryIntegrity`, which counts the entries a
    // navigation is allowed (none) with that gap wide open.
    const pendingId = selectPendingFocusId(state);
    if (pendingId !== null) return pendingId;

    const focused = selectFocusedFocusable(state);
    if (focused === null) return null;

    // Earth is the boot 'home' state: `wireInput` seeds it into focus so the
    // camera frames Earth, but home is the canonical EMPTY URL. Like the
    // `orientation` row's DEFAULT_ORIENTATION and the `t` row's live mode, the
    // home target composes no param, so a fresh load stays a bare URL. Compared
    // against EARTH_REF (the one home declaration) rather than a literal so the
    // omit rule cannot drift from the seed. The read is unaffected, so an
    // explicit `body-earth` from an old shared link still resolves on arrival.
    // The `EARTH_REF.type === 'body'` clause is a discriminant narrow (always
    // true) that lets TS reach `.id` on both tagged unions.
    if (focused.type === 'body' && EARTH_REF.type === 'body' && focused.id === EARTH_REF.id) {
      return null;
    }

    // Table dispatch on the union tag: galaxy ids run the codec ladder (null
    // when non-encodable), structures/bodies/stars yield their own id token. An
    // empty id (non-encodable row) contributes no param, same as null.
    return URL_HASH_FOR[focused.type](focused) || null;
  },
  read: (value) => [requestSelect(value), requestFocus(value)],
  readAbsent: () => [clearSelection()],
};

/**
 * `t` — the sim-clock instant. A manual clock crystallizes its moment onto the
 * URL as an ISO 8601 UTC timestamp; a live clock writes nothing, so a bare URL
 * means "now, forever". A shared link is a specimen: opening one lands the clock
 * in manual mode, paused, at that instant.
 *
 * ── write ──
 * Only manual mode contributes a `t`. The value is the anchor's `simDays` (the
 * sim instant at the last re-anchor), converted JD → Unix-ms → ISO. Serializing
 * the anchor rather than a live-derived instant is deliberate: it is a pure
 * function of the intent, so the write fires once per re-anchor (pause, scrub,
 * rate/direction change) and never per frame. Pause re-anchors, so "pause, then
 * share" freezes exactly the moment on screen.
 *
 * ── read ──
 * A parseable ISO string restores manual + paused at that instant via
 * `manualPausedAtActions` — the same shared operation the date-entry popover
 * commits through, so the shared-`nowMs` invariant that holds the instant
 * exactly is stated once, where it is sampled. An unparseable value yields no
 * actions: the hash is external input and a hand-typed timestamp is not a reason
 * to move the clock somewhere arbitrary.
 *
 * ── readAbsent ──
 * No `t` on the URL means live-at-now, so a back/forward navigation away from a
 * shared instant returns the clock to the wall clock rather than stranding it in
 * the previous entry's paused moment.
 */
const timeSource: HashParamSource = {
  key: 't',
  deepLink: true,
  writesOn: [(action) => action.type.startsWith(`${timeRoute}/`)],
  write: (state) => {
    const time = selectTimeState(state);
    if (time.mode !== 'manual') return null;
    return new Date(julianDaysToUnixMs(time.anchor.simDays)).toISOString();
  },
  read: (value) => {
    const unixMs = Date.parse(value);
    if (Number.isNaN(unixMs)) return [];
    return manualPausedAtActions(new Date(unixMs));
  },
  readAbsent: () => [goLiveNowAction()],
};

/**
 * `orientation` — which astronomical pole the camera treats as "up". A view
 * preference, not a navigational target: the share link should reproduce the
 * composition the author saw, which is why it is `deepLink: false` and does not
 * suppress the splash on its own.
 *
 * ── write ──
 * Only a non-default frame contributes a param, so a bare URL means "the default
 * orientation" and the common case adds no bytes. Comparing against
 * `DEFAULT_ORIENTATION` (not a hard-coded literal) keeps the omit-when-default
 * rule tied to the one place the default is declared.
 *
 * ── read ──
 * The value is routed through `isOrientationFrameId` first — the hash is
 * external input and could carry a hand-typed junk frame. A recognised frame
 * SNAPS via `setOrientation`; it deliberately does NOT start a frame tween, so a
 * shared link reproduces the composition instantly with no slerp on arrival.
 */
const orientationSource: HashParamSource = {
  key: 'orientation',
  deepLink: false,
  // `orientation` lives on `SceneSnapshot`, not `SettingsSnapshot` (see that
  // type's header), so the bulk settings restore (`mergeSnapshot`) provably
  // cannot move it — a raw settings patch of that shape has no `orientation`
  // key to carry. The tour's own restore (`restoreSceneSaga`) and its
  // beat-boundary reconstruction (`guidedTourSaga`) both go through
  // `requestOrientationChange` → `setOrientation` instead, which IS covered
  // below. If `orientation` ever moves back onto `SettingsSnapshot`, this
  // list must grow to include `mergeSnapshot`.
  writesOn: [setOrientation.match],
  write: (state) => {
    const orientation = selectOrientation(state);
    return orientation === DEFAULT_ORIENTATION ? null : orientation;
  },
  read: (value) => (isOrientationFrameId(value) ? [setOrientation(value)] : []),
  readAbsent: () => [setOrientation(DEFAULT_ORIENTATION)],
};

export const HASH_PARAM_SOURCES: readonly HashParamSource[] = [
  focusSource,
  timeSource,
  orientationSource,
];

/**
 * commitFocus — the shared "we have decided to focus on this galaxy" protocol.
 *
 * ### What this is
 *
 * Three public-handle methods on the engine — `focusOn`, `selectFamous`,
 * and `selectByAlias` — all converge on the same 2-3 line tail:
 *
 *   1. (optionally) update the selection subsystem with a new
 *      `(source, localIdx)` key so the halo lights up on the right row.
 *   2. Fire `cb.onFocusChange?.(info)` so React can echo the focus into
 *      the URL hash, the InfoCard, and any analytics listener.
 *   3. Hand `info` to `tweenToGalaxy(state, …)` so the camera glides
 *      onto the target with the framing distance derived from the
 *      galaxy's diameter.
 *
 * Pre-extraction every method spelled this dance out by hand.  The
 * result was three near-identical tails drifting independently — for
 * example, only `selectByAlias` carried the prebuilt-`info` race-window
 * note even though `selectFamous` had the same opportunity, and only
 * `focusOn` documented the `onFocusChange`-before-tween ordering even
 * though all three rely on it.  This helper is the single place where
 * the protocol is defined; the call sites supply only the genuinely
 * per-method bits (input validation, building the PointInfo, deciding
 * whether a selection update is part of "focus" for that path).
 *
 * ### Why selection is optional
 *
 * Focus and selection are intentionally separate concerns in this
 * engine.  `focusOn` is invoked when the user double-clicks (the click
 * handler has already updated `state.subsystems.selection` via a
 * different code path), or when the URL hash drives a focus without a
 * pinned selection at all.  Forcing every focus to clobber the
 * selection key would over-couple the two — passing `undefined` for
 * `selection` says "leave the selection subsystem alone, just move the
 * camera and notify React."
 *
 * ### Why selection.info is optional
 *
 * `setSelected`'s second parameter is a prebuilt PointInfo that the
 * selection subsystem will hand to `cb.onSelectChange` immediately,
 * bypassing its usual "look up the live cloud + sidecars at fan-out
 * time" path.  Two call shapes use this differently:
 *
 *   - `selectByAlias` passes `info` because it can be invoked from a
 *     deep-link drain that fires the moment the data-side cloud
 *     arrives — but the renderer hasn't uploaded yet.  In that race
 *     window, the subsystem's lazy lookup would return `null` (the
 *     point-cloud upload trails the data-side `clouds.set` by a frame
 *     or two), and the InfoCard would briefly show a blank pin.
 *     Handing the prebuilt `info` straight through fixes the React
 *     side immediately; the halo catches up on the next upload.
 *
 *   - `selectFamous` omits `info` because it's only invoked from the
 *     palette pick path, which can only fire after the famous catalog
 *     has loaded and uploaded — so the subsystem's live lookup
 *     reliably succeeds and we'd rather it read the freshest sidecars
 *     itself than capture a snapshot here.
 *
 * Encoding both shapes as one optional field on a single call lets each
 * site opt in by passing `info`, or out by omitting it, without
 * branching on a flag.
 *
 * ### Why this lives in `helpers/`, not `subsystems/`
 *
 * `subsystems/` is for closure-returning factories that own internal
 * state (the selection subsystem keeps its own `hovered`/`selected`
 * pair; `tweenManager` owns the in-flight tween).  `commitFocus` owns
 * nothing — it's a pure protocol kernel that fans calls out to existing
 * subsystems.  Putting it under `helpers/` matches the home of the
 * other stateless engine utilities (`cssToTexPx`, `engineReady`,
 * `logCameraState`).
 *
 * ### What's deliberately NOT here
 *
 * - The cam-null guard.  `tweenToGalaxy` already absorbs the
 *   pre-bootstrap / post-destroy race internally (see its module
 *   header), and `focusOn` keeps its own cam-null guard inline because
 *   it gates the `onFocusChange` callback too — failing silently with
 *   no callback fired keeps the URL hash from drifting away from the
 *   canvas state.
 *
 * - Building the `PointInfo`.  The lead-up varies meaningfully across
 *   the three callers (`focusOn` receives one ready-made; `selectFamous`
 *   resolves an id → localIdx; `selectByAlias` accepts caller-supplied
 *   sidecars to defend against a separate race), so the dedup stops at
 *   the shared tail.
 */

import type { EngineCallbacks, EngineState, PointInfo } from '../../../@types';
import type { SelectionInput } from '../subsystems/selectionSubsystem';
import { tweenToGalaxy } from '../camera/tweenToGalaxy';

/**
 * Optional selection update bundled into a `commitFocus` call.
 *
 * `key` is the `(source, localIdx)` pair the selection subsystem
 * stores; `info` is an optional prebuilt PointInfo that becomes the
 * `prebuiltInfo` argument to `setSelected` — see the module header for
 * why each caller does or doesn't supply it.
 */
export type CommitFocusSelection = {
  key: SelectionInput;
  /**
   * Optional prebuilt PointInfo to hand into `setSelected`'s second
   * arg.  `selectByAlias` passes this so the InfoCard updates
   * immediately during the deep-link race window where the cloud
   * arrived but the renderer hasn't uploaded yet.  `selectFamous`
   * omits it so the selection subsystem reads the live sidecars at
   * fan-out time.
   */
  info?: PointInfo;
};

/**
 * Run the shared focus-commit dance: optionally update selection,
 * fire `onFocusChange`, then start the camera tween.
 *
 * Order matters and is asserted by the call-site behaviour rather than
 * by tests: `setSelected` first so the InfoCard's selection echo lands
 * before the URL hash flips, `onFocusChange` second so the hash update
 * doesn't lap the React selection state, and `tweenToGalaxy` last so
 * the camera animation begins on a frame where the React side has
 * already observed the new focus target.
 */
export function commitFocus(
  state: EngineState,
  cb: EngineCallbacks,
  info: PointInfo,
  selection?: CommitFocusSelection,
): void {
  if (selection) {
    state.subsystems.selection.setSelected(selection.key, selection.info);
  }
  cb.onFocusChange?.(info);
  tweenToGalaxy(state, info);
}

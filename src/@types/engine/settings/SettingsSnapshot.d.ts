/**
 * SettingsSnapshot — the whole-cluster capture the cinematic tour takes
 * before it plays an effect, and restores afterwards.
 *
 * ### Why these clusters and not the whole settings bag
 *
 * The tour captures, mutates, and restores the user's settings around a
 * playback. Only the clusters that carry user-visible *visibility* and
 * *look* knobs the tour actually touches belong in the snapshot:
 *
 *   - `galaxyCatalogs` — point-billboard appearance + per-catalog gates.
 *   - `structures`     — ring/marker + label visibility per category.
 *   - `cosmicWebDensity`   — scalar-volume master gate + per-field params.
 *   - `cosmicWebFilaments` — filament-skeleton master gate + intensity.
 *   - `milkyWay`       — Milky-Way disk + label axes.
 *   - `zoneOfAvoidance` — galactic-plane dust band + its lettering; the
 *                         Zone-of-Avoidance view drives it, and a viewer who
 *                         switched the band off must get that choice back.
 *   - `flow`           — CF4++ flow-field overlay gate + look/motion knobs.
 *   - `localBubble`    — the Local Bubble shell's gate.
 *   - `constellations` — constellation figures + their lettering.
 *   - `orbitTrails`    — near-field Keplerian orbit-trails master gate.
 *   - `starCatalogs`   — star-catalog gates + per-catalog caption toggles.
 *   - `bodies`         — per-body visibility + caption toggles.
 *   - `labels`         — cross-cutting label-presentation mode (focusedOnly).
 *   - `picking`        — which selection kinds a scene click or hover may
 *                         resolve; a takeover drives it and the bracket must
 *                         restore it, exactly what this type is for.
 *   - `camera`         — the FOV. `runTakeoverSaga` pins it, because a takeover's
 *                         poses are authored at one lens and a viewer who left
 *                         the slider narrow would otherwise get a framing that
 *                         silently clamps (`sphereFitDistance` → the
 *                         `MAX_DISTANCE_MPC` ceiling), worst at portrait
 *                         aspect. Driven ⇒ captured.
 *
 * `starCatalogs` brings its shared look knobs (`sizePx`, `brightness`, the
 * exposure anchors) into the capture along with the gates — this module
 * already captures whole clusters with zero per-field projection, and
 * `galaxyCatalogs` does the same today, so pulling the look knobs along for
 * the ride is consistent with existing policy rather than a new one.
 *
 * The remaining clusters (`tonemap`, `bloom`, `hdr`, `bias`, `earth`,
 * `blackHoleLensingTuning`, `thumbnails`, `debug`) are deliberately excluded:
 * the tour neither drives nor restores them, so capturing them would invite a
 * restore that stomps a value the tour never meant to own. That test is what
 * admitted `camera` — excluded on the same grounds until the bracket started
 * pinning the FOV.
 *
 * The standing invariant, and the reason `localBubble` and `constellations`
 * are here: every key in `VISIBILITY_LAYER_ROWS` is addressable by a clip's
 * `hide()`/`show()` cue, which writes visibility INTENT into settings. So each
 * of those 19 keys must resolve to a cluster in this list, or a tour that
 * hides that layer leaves it hidden after the restore. Those two Layers landed
 * after this list was written and were missed; a new Layer must not repeat it.
 *
 * `orientation` is deliberately NOT here, even though it is a `mergeSnapshot`
 * payload's sibling concern conceptually: it rides on `SceneSnapshot` instead,
 * beside `focus` — see that type's header for why. The precedent is
 * `tierSlice` (`src/state/tier/tierSlice.ts`), which was pulled out of
 * `settings` for the identical reason: a scalar that lives inside a
 * `Pick<EngineSettingsState, …>` a whole-cluster restore can reach gets swept
 * as a side effect of an unrelated merge. Keeping `orientation` off this type
 * makes that failure mode a compile error, not a runtime landmine — see
 * `mergeSettingsSnapshot`'s reducer, which spreads whatever this type allows.
 *
 * ### Why Readonly
 *
 * A captured snapshot is a frozen baseline — restore reads it, nothing
 * writes it. Marking it `Readonly` keeps a caller from mutating the
 * captured value in place and silently corrupting what gets restored.
 */

import type { EngineSettingsState } from '../../settings/EngineSettingsState';

export type SettingsSnapshot = Readonly<
  Pick<
    EngineSettingsState,
    | 'galaxyCatalogs'
    | 'structures'
    | 'cosmicWebDensity'
    | 'cosmicWebFilaments'
    | 'milkyWay'
    | 'zoneOfAvoidance'
    | 'flow'
    | 'localBubble'
    | 'constellations'
    | 'orbitTrails'
    | 'starCatalogs'
    | 'bodies'
    | 'labels'
    | 'picking'
    | 'camera'
  >
>;

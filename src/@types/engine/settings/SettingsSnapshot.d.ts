/**
 * SettingsSnapshot — the whole-cluster capture the cinematic tour takes
 * before it plays an effect, and restores afterwards.
 *
 * ### Why these ten clusters and not the whole settings bag
 *
 * The tour captures, mutates, and restores the user's settings around a
 * playback. Only the clusters that carry user-visible *visibility* and
 * *look* knobs the tour actually touches belong in the snapshot:
 *
 *   - `galaxyCatalogs` — point-billboard appearance + per-catalog gates.
 *   - `structures`     — ring/marker + label visibility per category.
 *   - `volumes`        — scalar-volume master gate + per-field params.
 *   - `filaments`      — filament-skeleton master gate + intensity.
 *   - `milkyWay`       — Milky-Way disk + label axes.
 *   - `flow`           — CF4++ flow-field overlay gate + look/motion knobs.
 *   - `orbitTrails`    — near-field Keplerian orbit-trails master gate.
 *   - `starCatalogs`   — star-catalog gates + per-catalog caption toggles.
 *   - `bodies`         — per-body visibility + caption toggles.
 *   - `labels`         — cross-cutting label-presentation mode (focusedOnly).
 *
 * `starCatalogs` brings its shared look knobs (`sizePx`, `brightness`, the
 * exposure anchors) into the capture along with the gates — this module
 * already captures whole clusters with zero per-field projection, and
 * `galaxyCatalogs` does the same today, so pulling the look knobs along for
 * the ride is consistent with existing policy rather than a new one.
 *
 * The remaining clusters (`tonemap`, `bloom`, `camera`, `bias`, `thumbnails`,
 * `debug`) are deliberately excluded: the tour neither drives nor restores
 * them, so capturing them would invite a restore that stomps a value the
 * tour never meant to own.
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
    | 'volumes'
    | 'filaments'
    | 'milkyWay'
    | 'flow'
    | 'orbitTrails'
    | 'starCatalogs'
    | 'bodies'
    | 'labels'
  >
>;

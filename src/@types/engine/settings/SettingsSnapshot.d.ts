/**
 * SettingsSnapshot — the whole-cluster capture the cinematic tour takes
 * before it plays an effect, and restores afterwards.
 *
 * ### Why these six clusters and not the whole settings bag
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
 *
 * The remaining clusters (`tonemap`, `camera`, `bias`, `thumbnails`,
 * `debug`) are deliberately excluded: the tour neither drives nor restores
 * them, so capturing them would invite a restore that stomps a value the
 * tour never meant to own.
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
    'galaxyCatalogs' | 'structures' | 'volumes' | 'filaments' | 'milkyWay' | 'flow'
  >
>;

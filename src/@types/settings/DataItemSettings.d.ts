/**
 * DataItemSettings — the shared base for every per-item entry under a
 * source-type settings cluster (`settings.surveys.items`,
 * `settings.structures.items`, `settings.volumes.items`).
 *
 * Visibility is the ONE axis every data item has, regardless of whether
 * it's a survey point layer, a structure ring, or a scalar-volume field —
 * so the base IS that single boolean rather than a wrapper around it. This
 * is what lets the whole settings tree expose a uniform
 * `settings.<sourceType>.items[id].enabled` accessor: the demand gate, the
 * React panel, and the snapshot/restore seam all read the same field name
 * no matter which cluster they're walking.
 *
 * Anything beyond visibility belongs to the specific item type: label-bearing
 * items add `labelEnabled` (see `SurveyItemSettings` / `StructureItemSettings`),
 * and volume fields stack their per-field render knobs on top via
 * `VolumeFieldSettings extends DataItemSettings`. Keeping the base this thin
 * avoids the alternative — a fat union or a grab-bag of optional fields — that
 * would force every reader to know which axes a given item actually carries.
 *
 * Mutable by design: these leaves live inside `EngineSettingsState`, which the
 * engine assigns to in place (`settings.x.items[id].enabled = v`), so no
 * `readonly` here — matches the surrounding settings leaf types.
 */

export type DataItemSettings = {
  /** The item's PRIMARY visibility — survey layer on, structure ring shown, volume field mixed in. */
  enabled: boolean;
};

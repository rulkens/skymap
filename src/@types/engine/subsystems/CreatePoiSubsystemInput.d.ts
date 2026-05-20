/**
 * Construction-time hooks for `createPoiSubsystem`.
 *
 * Currently empty — the subsystem owns only POI rendering data
 * (table, visibility records).  Selection state moved into
 * `selectionSubsystem`; this type stays as an empty object so the
 * factory keeps its argument shape symmetric with sibling subsystem
 * factories (future POI-adjacent hooks can land here without a
 * call-site signature break).
 */
export type CreatePoiSubsystemInput = Record<string, never>;

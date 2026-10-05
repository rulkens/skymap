/**
 * SELECTION_KINDS — the runtime enumeration of every kind a selection can
 * name. `SelectionKind` and `FocusableTargetType` both derive from this list
 * rather than restating it, and totality folds (`detailCardTable`) iterate it
 * directly, so a new kind is one entry here instead of three hand-kept lists.
 */
export const SELECTION_KINDS = [
  'galaxyCatalog',
  'structure',
  'milkyWay',
  'zoneOfAvoidance',
  'body',
  'starCatalog',
  'blackHole',
] as const;

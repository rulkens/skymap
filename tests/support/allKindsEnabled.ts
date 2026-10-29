import type { SelectionKind } from '../../src/@types/engine/SelectionKind';

/** `composeSelectionRows` requires `kindsEnabled`; "pick everything" is a fixture here, never a default. */
export const ALL_KINDS_ENABLED: Record<SelectionKind, boolean> = {
  galaxyCatalog: true,
  structure: true,
  milkyWay: true,
  zoneOfAvoidance: true,
  body: true,
  craft: true,
  earthScene: true,
  starCatalog: true,
  blackHole: true,
};

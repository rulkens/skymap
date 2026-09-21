import type { SelectionKind } from '../../src/@types/engine/SelectionKind';

/**
 * Every selection kind pickable — what a test means when it is not exercising
 * the per-view pick gate at all. `composeSelectionRows` takes `kindsEnabled`
 * as a REQUIRED argument so the app's one construction site cannot forget it;
 * "pick everything" survives only here, where it is a fixture rather than a
 * silent default.
 */
export const ALL_KINDS_ENABLED: Record<SelectionKind, boolean> = {
  galaxyCatalog: true,
  structure: true,
  milkyWay: true,
  zoneOfAvoidance: true,
  body: true,
  star: true,
};

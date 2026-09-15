/**
 * SimBodyId — the bodies the migrated frame-sim fixtures focus or measure
 * against, in the `deriveBodyStates` / `SCENE_BODIES` id space (per-body
 * identity) — a different, wider domain than `BodyId` (the visibility-toggle
 * id space, where every planet shares the single `'planet'` row). Only the
 * planets carry a datum radius, so a rover may be focused but not booted at.
 */
export type SimBodyId = 'earth' | 'mars' | 'saturn' | 'curiosity' | 'opportunity';

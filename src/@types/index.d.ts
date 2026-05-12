/**
 * Barrel re-export of `@types/`.
 *
 * Engine-prefixed types (`EngineHandle`, `EngineState`, sub-bags,
 * sub-handles), `PointInfo`, and `ScaleInfo` no longer re-export here —
 * consumers deep-import from `@types/engine/...` instead.  The barrel
 * stays in place for the remaining root-level files (currently none;
 * subfolder types should be deep-imported directly from their files).
 */

export {};

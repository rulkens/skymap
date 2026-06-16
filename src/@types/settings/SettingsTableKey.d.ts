/**
 * SettingsTableKey — the thirteen names of the engine's "boring"
 * table-driven public-handle setters (see
 * `src/services/engine/wiring/settingsTable.ts`).
 *
 * Frozen in tests so a future accidental drift (boring setter
 * promoted to bespoke, or vice versa) fails loudly rather than
 * silently.
 *
 * These names are not part of `EngineHandle` — they're the internal
 * identity of each descriptor row, used as Record keys so the
 * sub-handle forwarders in `engine.ts` can resolve a forwarder by
 * name (`boringSetters.setPointSize`).
 *
 * Setters that ALSO drive a fade or other side effect are NOT here — they live
 * as bespoke `handles/` functions: `handle.flow.set(patch)` (whole-patch
 * dispatch + per-leaf effects), and `milkyWay`/`filaments` visibility
 * (`setMilkyWayEnabled` / `setFilamentsEnabled` call the action + the fade
 * bridge). Only the boring "dispatch + render" cases are table rows.
 */

export type SettingsTableKey =
  | 'setPointSize'
  | 'setBrightness'
  | 'setAutoRotate'
  | 'setGalaxyTexturesEnabled'
  | 'setFilamentIntensity'
  | 'setHighlightFallback'
  | 'setRealOnlyMode'
  | 'setDepthFadeEnabled'
  | 'setAbsMagLimit'
  | 'setExposure'
  | 'setToneMapCurve'
  | 'setShowPickBuffer'
  | 'setShowDiskRadiusRing';

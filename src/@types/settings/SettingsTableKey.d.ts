/**
 * SettingsTableKey — the fifteen names of the engine's "boring"
 * table-driven public-handle setters (see
 * `src/services/engine/wiring/settingsTable.ts`).
 *
 * Frozen in tests so a future accidental drift (boring setter
 * promoted to bespoke, or vice versa) fails loudly rather than
 * silently.
 *
 * These names are no longer part of `EngineHandle` (the H5 task 12
 * cleanup deleted the flat methods) — they're kept as the internal
 * identity of each descriptor row, used as Record keys so the
 * sub-handle forwarders in `engine.ts` can resolve a forwarder by
 * name (`boringSetters.setPointSize`).
 */

export type SettingsTableKey =
  | 'setPointSize'
  | 'setBrightness'
  | 'setAutoRotate'
  | 'setGalaxyTexturesEnabled'
  | 'setMilkyWayEnabled'
  | 'setFilamentsEnabled'
  | 'setFilamentIntensity'
  | 'setHighlightFallback'
  | 'setRealOnlyMode'
  | 'setDepthFadeEnabled'
  | 'setAbsMagLimit'
  | 'setExposure'
  | 'setToneMapCurve'
  | 'setShowPickBuffer'
  | 'setShowDiskRadiusRing';

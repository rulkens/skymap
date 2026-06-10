/**
 * SettingsTableKey — the twenty-four names of the engine's "boring"
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
 */

export type SettingsTableKey =
  | 'setPointSize'
  | 'setBrightness'
  | 'setAutoRotate'
  | 'setGalaxyTexturesEnabled'
  | 'setMilkyWayEnabled'
  | 'setFilamentsEnabled'
  | 'setFilamentIntensity'
  | 'setFlowEnabled'
  | 'setFlowMode'
  | 'setFlowIntensity'
  | 'setFlowCount'
  | 'setFlowTrail'
  | 'setFlowSpeed'
  | 'setFlowDensityBias'
  | 'setFlowWander'
  | 'setFlowBoundaryFadeWidth'
  | 'setHighlightFallback'
  | 'setRealOnlyMode'
  | 'setDepthFadeEnabled'
  | 'setAbsMagLimit'
  | 'setExposure'
  | 'setToneMapCurve'
  | 'setShowPickBuffer'
  | 'setShowDiskRadiusRing';

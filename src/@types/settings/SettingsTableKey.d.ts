/**
 * SettingsTableKey — the fifteen names of the engine's "boring"
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
 * The flow overlay's setters are NOT here: `handle.flow.set(patch)` dispatches
 * the whole-patch `setFlowAction` and then runs per-leaf side effects, so it's
 * a bespoke setter, not a table row.
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

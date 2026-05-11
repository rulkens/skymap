/**
 * EngineSettingsState — the user-facing rendering settings sub-bag of
 * the canonical `EngineState`.
 *
 * ### Why this type lives apart from EngineState
 *
 * Phase 4 of the engine refactor pulled ~30 scattered `let` bindings
 * inside `createEngine`'s closure into a single `state` object grouped
 * by concern.  This sub-bag holds every value the SettingsPanel surfaces
 * — point size, brightness, the toggle flags, the tone-map curve / exposure
 * — plus the underlying flags the engine forwards into the per-frame
 * uniform buffer.
 *
 * Splitting it out as its own named type rather than inlining the shape
 * inside `EngineState = { settings: { ... } }` lets the engine's setter
 * functions accept a single bag (`(s: EngineSettingsState) => void`)
 * when their work depends on more than one field, and mirrors the way
 * the seed-callbacks and render-frame helpers already accept named
 * bags rather than the whole engine state.
 *
 * ### Shape (post-H5)
 *
 * Every settings field lives under one of eight named clusters.  The
 * clusters mirror EngineHandle's sub-handle namespaces 1:1 — a setter
 * on `handle.points` writes into `state.settings.points`, a setter on
 * `handle.tonemap` writes into `state.settings.tonemap`, etc.  This
 * shape makes the engine's per-frame snapshot and the React-facing
 * setters trivially derivable from each other.
 *
 * Prior to H5 (2026-05-11) this type carried ~14 flat fields at the
 * root in addition to the cluster sub-bags; settingsTable wrote to
 * both, and consumers read from whichever they were wired to.  Task
 * 12 of the H5 plan deleted the flat half once every reader had
 * migrated.
 *
 * ### Mutation contract
 *
 * Every leaf field is mutated in place by the public-handle setters in
 * `engine.ts` (forwarded via `boringSetters` constructed from
 * `settingsTable.ts`) and read inside the per-frame loop and the
 * `renderFrame` dispatch.  The type is intentionally NOT `Readonly<>` —
 * see the smoke tests in `tests/@types/engineState.test.ts` for the
 * contract assertion.
 *
 * ### Initial values
 *
 * Defaults live in `data/defaults.ts` (the single source of truth shared
 * with App.tsx so the SettingsPanel doesn't flash a stale value before
 * the first echo callback fires); the consumer constructs an
 * `EngineSettingsState` value by pulling those constants into each field.
 */

import type { BiasMode } from '../data/biasMode';
import type { ToneMapCurve } from '../data/toneMapCurve';
import type { ScalarFieldPaletteId } from './ScalarCube';

/**
 * Per-field runtime controls for one registered scalar-volume field.
 *
 * Stored in `EngineSettingsState.volumes.fields` keyed by the same
 * handle string passed to `addVolumeField` / `removeVolumeField`.  The
 * engine seeds these at registration time (via `DEFAULT_VOLUME_FIELD_INTENSITY`)
 * and keeps them in sync with every `setVolumeFieldEnabled` /
 * `setVolumeFieldIntensity` call, so the SettingsPanel can read the
 * authoritative per-field state without polling the GPU handle.
 */
export type VolumeFieldSettings = {
  /** When false, `scalarVolumeRenderer.setEnabled(handle, false)` silences this field. */
  enabled: boolean;
  /** Linear mix-in weight in [0, 1].  Seeded from `DEFAULT_VOLUME_FIELD_INTENSITY`. */
  intensity: number;
  /**
   * LUT-coordinate contrast around the 0.5 pivot (gamma-style remap).
   * 1.0 is identity; > 1.0 pushes mid-tones toward the saturated ends
   * of the palette (more visible structure for divergent palettes
   * centered on the cosmic mean); < 1.0 compresses toward the midpoint.
   * Orthogonal to `intensity`: intensity controls overall opacity,
   * contrast controls dynamic-range remapping.  Seeded from
   * `DEFAULT_VOLUME_FIELD_CONTRAST`.
   */
  contrast: number;
  /**
   * Per-cube opacity multiplier driving the scalar-volume shader's
   * alpha integral (`1 - exp(-densityScale * sample * step)`).  Seeded
   * at registration time from `VOLUME_FIELD_DEFAULTS[handle]`
   * (SCFD v2's per-handle registry; see
   * `src/data/volumeFieldDefaults.ts`) and mutated by
   * `setVolumeFieldDensityScale`.  Orthogonal to `intensity` (global
   * mix-in weight) and `contrast` (LUT-coordinate remap): density
   * tunes the optical-depth contribution per voxel-step, so it shifts
   * the balance between "transparent fog" and "saturated cloud"
   * without changing the colour ramp.  Falls back to
   * `DEFAULT_VOLUME_FIELD_DENSITY_SCALE` for unregistered handles.
   */
  densityScale: number;
  /**
   * Palette LUT id for this field.  Each volume field owns its own LUT
   * texture (see `scalarVolumeRenderer.ts`); this value mirrors the
   * renderer's per-field palette so the SettingsPanel dropdown can read
   * authoritative state without going through the GPU handle.  Seeded
   * from `VOLUME_FIELD_DEFAULTS[handle].paletteId` at registration time
   * (SCFD v2 cubes no longer carry palette themselves).
   */
  paletteId: ScalarFieldPaletteId;
};

export type EngineSettingsState = {
  /**
   * Point-billboard rendering controls — every setting that influences
   * `points.wgsl` or the per-instance attribute bake.
   */
  points: {
    sizePx: number;
    brightness: number;
    depthFade: boolean;
    highlightFallback: boolean;
    realOnly: boolean;
  };

  /**
   * HDR → LDR tone-mapping controls.  Consumed by the post-process pass
   * and not tied to any individual draw call.
   */
  tonemap: {
    exposure: number;
    curve: ToneMapCurve;
  };

  /**
   * Camera-orbit behaviour controls.  Currently just `autoRotate`;
   * future tween / damping knobs would also live here.
   */
  camera: {
    autoRotate: boolean;
  };

  /**
   * Luminosity-bias correction inputs — the user-tunable subset.  The
   * bake-derived fields (`apparentMagLimit`, `schechterMStar`,
   * `schechterAlpha`) stay on `state.bias` — they're outputs of the
   * worker bake, not user-facing settings, so they don't belong in
   * the SettingsPanel's mental model.
   */
  bias: {
    mode: BiasMode;
    absMagLimit: number;
  };

  /**
   * Galaxy-thumbnail overlay master toggle.  The underlying feature is
   * "per-galaxy thumbnail quads on close approach"; `thumbnails.enabled`
   * reads more cleanly at call sites than the old `galaxyTexturesEnabled`.
   */
  thumbnails: {
    enabled: boolean;
  };

  /**
   * Milky-Way disk overlay master toggle.
   */
  milkyWay: {
    enabled: boolean;
  };

  /**
   * Filament-skeleton overlay controls.  Master toggle + intensity scale
   * paired because the intensity slider is meaningless when the master
   * toggle is off.
   */
  filaments: {
    enabled: boolean;
    intensity: number;
  };

  /**
   * Scalar-volume overlay controls.  `masterEnabled` is the master gate
   * (when false, `scalarVolumePass.enabled` short-circuits before
   * consulting the renderer at zero GPU cost).  `fields` is the
   * per-handle settings record populated by `addVolumeField` and
   * emptied by `removeVolumeField` — empty `{}` at engine startup.
   */
  volumes: {
    masterEnabled: boolean;
    fields: Record<string, VolumeFieldSettings>;
  };
};

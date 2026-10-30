/**
 * DebugSettings — the `debug` cluster of `CoreSettingsState`: diagnostic lenses
 * on the rendered scene rather than knobs on the scene itself.
 */

import type { ClipId } from '../animation/ClipId';
import type { SplineMode } from '../animation/SplineMode';
import type { PassByDir } from '../animation/PassByDir';
import type { ClipPathTuningActive } from './ClipPathTuningActive';
import type { RenderStrategy } from '../engine/frame/RenderStrategy';
import type { DebugOverlayKey } from '../data/debug/DebugOverlayKey';

export type DebugSettings = {
  overlays: Record<DebugOverlayKey, boolean>;
  /**
   * Radius of the `terrain-pick-marker` overlay's sphere, in WORLD metres —
   * the gauge the user reads the CPU-floor/GPU-surface height gap against, so
   * it is a physical size the user sets, never a screen-pixel one. Only the
   * marker pass and its readout read it; dead with that overlay off.
   */
  terrainPickMarkerRadiusM: number;
  /**
   * Pass names toggled off, membership by `[name] === true`. Consulted AFTER
   * each pass's own `enabled()`, so the override is ONE-WAY: it can hide a pass
   * that would run, never force-enable one whose gate said false.
   */
  disabledPasses: Record<string, boolean>;
  /**
   * The frame clears white instead of black (the `hdr` row's clear). Only the
   * site shot tool sets it, to take a subject's alpha from a black/white pair.
   */
  matteWhite: boolean;
  /**
   * A uniform fill light on mesh bodies (craft, shape-model moons), as a fraction
   * of sunlight from every direction: 0 is the app's own look. Only the site shot
   * tool sets it, to open up a craft's shadow side against black space.
   */
  meshAmbient: number;
  /**
   * Decouples the frame's pass SHAPE from GPU-timing collection: `'auto'`
   * reproduces the timing-derived choice, keeping `?gpuTimings` byte-identical.
   */
  renderStrategy: RenderStrategy | 'auto';
  /**
   * Clip-path inspector: the UI-owned scalars the flyPath pacing knobs bake into
   * a clip at Calculate time (`applyPathTuning`); sampled geometry stays
   * off-store in the `clipPathInspector` subsystem. Units — `scrub01` is a
   * `[0,1]` fraction, NOT seconds; `align` / `rampSec` / `lingerSec` / `lookAhead`
   * are seconds (`rampSec` 0 = use the clip's named `ease`); `linger` is a dwell
   * depth ∈ [0,1], 0 = cruise through; `passByOffset` is in subject-radius
   * units, 0 = through centre. `clipId` null = nothing computed.
   *
   * While a knob's `active` gate is off, the clip's authored value flows through
   * untouched. `turnDelay` / `lookAhead` have no gate of their own — they ride
   * `spline`, so they cannot apply onto a basis that ignores them.
   */
  clipPathInspect: {
    clipId: ClipId | null;
    scrub01: number;
    align: number;
    rampSec: number;
    linger: number;
    lingerSec: number;
    spline: SplineMode;
    turnDelay: number;
    lookAhead: number;
    passByOffset: number;
    passByDir: PassByDir;
    /** Per-knob override gate — only an active knob is baked into the clip. */
    active: ClipPathTuningActive;
  };
};

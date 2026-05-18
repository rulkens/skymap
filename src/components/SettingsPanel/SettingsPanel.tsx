/**
 * SettingsPanel — bottom-left overlay for real-time rendering controls.
 *
 * ### What it does
 *
 * Renders four controls that let the user tune the galaxy renderer without
 * reloading the page:
 *
 *   1. Point size slider  — adjusts the billboard pixel radius (1 – 8 px).
 *   2. Brightness slider  — global star intensity multiplier (0.2 – 3.0).
 *   3. Auto-rotate toggle — enables slow camera yaw (~3°/sec).
 *   4. Reset camera button — snaps the camera back to the initial framing.
 *
 * ### Why it lives here
 *
 * This file sits alongside the other purely-presentational components
 * (InfoCard, ScaleBar, StatusBar). Like them, it has no knowledge of WebGPU,
 * the engine, or async data loading — it only receives typed props and emits
 * events up to App.tsx.
 *
 * ### Props-driven flow (no internal state)
 *
 * App.tsx owns all four pieces of state (pointSize, brightness, autoRotate,
 * and the "reset" trigger). The panel renders the current values and fires
 * callback props when the user changes a control:
 *
 *   User drags slider → onChange prop fires → App.tsx calls handle.points.setSize
 *   → engine updates closure variable → next frame uses new value.
 *
 * This one-way data flow keeps the panel a pure function of its inputs, which
 * makes it easy to test and reason about.
 *
 * ### CSS
 *
 * Layout rules live in SettingsPanel.module.css alongside this file, replacing
 * the former #settings-panel block in index.html.
 */

import { type ReactNode } from 'react';
import type { LodMode } from '../../@types/data/LodMode';
import type { Tier } from '../../@types/data/Tier';
import { Source, sourceLabel, maskHas } from '../../data/sources';
import { BiasMode } from '../../data/biasMode';
import type { BiasMode as BiasModeT } from '../../@types/data/BiasMode';
import { ToneMapCurve, ALL_TONE_MAP_CURVES, toneMapCurveLabel } from '../../data/toneMapCurve';
import type { ToneMapCurve as ToneMapCurveT } from '../../@types/data/ToneMapCurve';
import type { PoiCategory } from '../../services/engine/subsystems/poiSubsystem';
import type { ScalarFieldPaletteId } from '../../@types/data/ScalarFieldPaletteId';
import type { VolumeFieldRowData } from '../../@types/settings/VolumeFieldRowData';
import { VolumeFieldRow } from './VolumeFieldRow';
import { Panel } from '../common/Panel/Panel';
import { CollapsibleSection } from './CollapsibleSection';
import { TierSelector } from './TierSelector';
import styles from './SettingsPanel.module.css';

// ── Module-level constants ─────────────────────────────────────────────────────

/**
 * The set of survey sources we expose as user-controllable toggles.
 *
 * Note that `Source.Synthetic` is **intentionally omitted** — the synthetic
 * cloud is a procedurally-generated *fallback* used when no real survey data
 * has loaded yet (e.g. on first paint before binaries arrive, or in offline
 * dev runs). Letting users toggle it would invite confusing states like
 * "no real surveys + synthetic off = empty sky" with no clear way back.
 * Keeping it always-on but invisible-in-the-UI means the renderer always has
 * *something* to draw while the user freely toggles the real catalogs.
 */
// Ordered smallest-catalogue → largest (Famous ~20 → 2MRS ~38 k → SDSS
// ~500 k → GLADE ~2 M) so the user sees the "iceberg tip" first and can
// reason about what each toggle adds in size.
const TOGGLEABLE_SOURCES: readonly Source[] = [
  Source.Famous,
  Source.TwoMRS,
  Source.SDSS,
  Source.Glade,
];

// ── Props ──────────────────────────────────────────────────────────────────────

/**
 * Props for SettingsPanel.
 *
 * The original four controls (point size / brightness / auto-rotate / reset
 * camera) are all required — App.tsx always wires them to the engine handle.
 *
 * The newer rev-2 controls (survey toggles + Auto-LOD) are **optional**.
 * That's deliberate: this component is being updated ahead of the App.tsx
 * wiring (task #37 in the multi-survey plan). Keeping the new props optional
 * lets the existing call site in App.tsx keep typechecking unchanged, and
 * the new sections render only when the parent opts-in by passing them.
 */
type Props = {
  /** Current point size in pixels. */
  pointSize: number;
  /** Current global brightness multiplier. */
  brightness: number;
  /** Whether the camera is currently auto-rotating. */
  autoRotate: boolean;
  /** Called when the user changes the point-size slider. */
  onPointSizeChange: (v: number) => void;
  /** Called when the user changes the brightness slider. */
  onBrightnessChange: (v: number) => void;
  /** Called when the user toggles auto-rotate. */
  onAutoRotateChange: (v: boolean) => void;
  /** Whether galaxy texture thumbnails are rendered close-up on visible galaxies. */
  galaxyTexturesEnabled: boolean;
  /** Fired when the user toggles the galaxy-thumbnails checkbox. */
  onGalaxyTexturesChange: (enabled: boolean) => void;
  /**
   * Whether the procedural Milky Way impostor at world origin is
   * rendered.  Optional — older call sites without this prop see no
   * Milky Way row in the panel.  See
   * `services/gpu/milkyWayRenderer.ts` for what the impostor is.
   */
  milkyWayEnabled?: boolean;
  /** Fired when the user toggles the "Show Milky Way" checkbox. */
  onMilkyWayEnabledChange?: (enabled: boolean) => void;
  /**
   * Per-category POI label visibility.  Surfaced as four always-visible
   * checkboxes inside the Overlays sub-group.  All four default to true.
   */
  labelCategoryVisibility: Readonly<Record<PoiCategory, boolean>>;
  onSetLabelCategoryVisibility: (category: PoiCategory, visible: boolean) => void;
  /**
   * Whether the cosmic-web filament-skeleton overlay is rendered.  The
   * underlying `filaments.bin` is an *optional* asset built by the
   * DisPerSE pipeline (`npm run build-filaments`); on a fresh clone
   * without it, toggling this on is a silent no-op.  Optional in the
   * panel — older callers without the prop pair see no Filaments row.
   */
  filamentsEnabled?: boolean;
  /** Fired when the user toggles the "Filaments" checkbox. */
  onFilamentsChange?: (enabled: boolean) => void;
  /**
   * Filament-overlay intensity scale, [0, 1].  Optional like the
   * toggle pair — the slider only renders when both `filamentIntensity`
   * and `onFilamentIntensityChange` are provided AND the toggle is on.
   * Hidden when the overlay is disabled because the slider has no
   * visible effect there.
   */
  filamentIntensity?: number;
  onFilamentIntensityChange?: (value: number) => void;
  /**
   * Whether fallback-orientation galaxies should be tinted magenta in the
   * fragment shader.  Lets the user scan which surveys have real
   * photometric orientation coverage.  Optional — older call-sites without
   * this prop see no orientation toggle in the panel.
   */
  highlightFallback?: boolean;
  /** Fired when the user toggles the "Highlight fallback" checkbox. */
  onHighlightFallbackChange?: (enabled: boolean) => void;
  /**
   * Whether to discard fallback-orientation galaxies entirely (showing only
   * galaxies with measured b/a + PA).
   */
  realOnlyMode?: boolean;
  /** Fired when the user toggles the "Show only real" checkbox. */
  onRealOnlyModeChange?: (enabled: boolean) => void;
  /**
   * Whether the camera-distance depth fade is on (multiplies per-galaxy
   * alpha by `1 / (1 + (camDist / 1000Mpc)²)`).  Fights the cumulative-
   * overlap glow at the centre of the catalog volume.  Default ON.
   */
  depthFadeEnabled?: boolean;
  /** Fired when the user toggles the "Depth fade" checkbox. */
  onDepthFadeEnabledChange?: (enabled: boolean) => void;
  /** Called when the user clicks "Reset camera". */
  onResetCamera: () => void;
  /**
   * Currently-active data tier ('small' | 'medium' | 'large').  Drives
   * which segmented-control button renders as `aria-pressed=true`.
   * Optional like every other rev-2+ control on this panel — call sites
   * that don't wire `tier` + `onTierChange` simply see no TierSelector
   * row at the top of the body.
   */
  tier?: Tier;
  /** Called with the new tier when the user clicks a tier button. */
  onTierChange?: (tier: Tier) => void;
  /**
   * Bitmask of currently-visible sources (see `data/sources.ts`).
   * Optional until App.tsx is wired to the multi-survey engine.
   */
  visibleSourceMask?: number;
  /** Called when the user toggles a single survey on/off. */
  onToggleSource?: (source: Source, visible: boolean) => void;
  /**
   * Per-source point counts indexed by Source enum value.  Surveys whose
   * .bin hasn't loaded yet are simply absent from the map — the row in the
   * UI then renders the toggle without a count rather than a misleading "0".
   */
  sourceCounts?: Partial<Record<Source, number>>;
  /** Current LOD mode — `'auto'` (by zoom) or `'manual'` (user override). */
  lodMode?: LodMode;
  /** Called when the user toggles the Auto-LOD checkbox. */
  onSetLodMode?: (mode: LodMode) => void;

  // ── Density correction (Malmquist bias) ───────────────────────────────────
  //
  // Both props are optional so older call sites (and the Vitest snapshot
  // suite) continue to typecheck unchanged.  The whole section is gated on
  // *both* the value and the callback being present — the same idiom the
  // surveys + LOD sections use.

  /**
   * Currently-selected density-correction mode.  See `data/biasMode.ts` for
   * the full astronomy explanation; in short, `None` shows the raw catalog,
   * `VolumeLimited` discards faint galaxies in the back of the volume so
   * what's left is a "complete" sub-sample, and the two future modes
   * (`VMax`, `Schechter`) reweight by inverse-V_max or by the predicted
   * Schechter luminosity function.  Tasks 3 + 4 in the bias-correction plan
   * implement those — for now they appear as disabled options so the UI
   * shape doesn't shift when they land.
   */
  biasMode?: BiasModeT;
  /** Called when the user picks a different density-correction mode. */
  onBiasModeChange?: (mode: BiasModeT) => void;
  /**
   * Faintest absolute magnitude (M_lim) kept under `BiasMode.VolumeLimited`.
   * Larger / more-positive numbers mean a fainter cut-off (more galaxies
   * survive); −24 mag is roughly the brightest cD-galaxy regime, −15 mag
   * dips well into dwarf territory.  Default −19 mag is a sensible threshold
   * for SDSS spec samples (~M*+1).  Only displayed when `biasMode` is
   * `VolumeLimited` because the future modes don't use a hard threshold —
   * 1/V_max weights every galaxy individually, and Schechter reweights by
   * an analytic luminosity function (see plan Task 3 + 4 sketches).
   */
  absMagLimit?: number;
  /** Called when the user drags the M_lim slider. */
  onAbsMagLimitChange?: (absMag: number) => void;

  // ── HDR tone-map curve selector ─────────────────────────────────────────
  //
  // Both props optional so older call sites continue to typecheck.  The
  // section is gated on both being present — same idiom as the bias-mode
  // section above.  The dropdown switches between five curves at runtime
  // via a single 4-byte uniform write, no pipeline rebuild.

  /** Currently-selected tone-mapping curve.  See `data/toneMapCurve.ts`. */
  toneMapCurve?: ToneMapCurveT;
  /** Called when the user picks a different tone-map curve. */
  onToneMapCurveChange?: (curve: ToneMapCurveT) => void;
  /**
   * Current HDR exposure multiplier — applied to the HDR signal *before*
   * the tone-map curve runs, so a low exposure (~0.3) brings cluster
   * cores out of saturation while a high one (~2.5) lifts the cosmic
   * web in dim regions.  Optional so call sites that don't care about
   * exposure (e.g. older fixtures) keep typechecking unchanged; the
   * slider section is gated on both this and the change callback being
   * present.
   */
  exposure?: number;
  /** Called when the user drags the exposure slider. */
  onExposureChange?: (value: number) => void;

  // ── SpaceMouse 6DOF input (optional, WebHID-only) ─────────────────────────
  //
  // All four props are optional so the original call sites continue to
  // typecheck unchanged. The section is rendered only when `spaceMouseSupported`
  // is true — App.tsx passes the result of `isWebHIDSupported()` so users on
  // Firefox/Safari see no UI for an inaccessible feature.

  /** Feature gate — only render the SpaceMouse section when true. */
  spaceMouseSupported?: boolean;
  /** Whether a SpaceMouse is currently paired and feeding input. */
  spaceMouseConnected?: boolean;
  /** Called when the user clicks the "Connect SpaceMouse" button. */
  onConnectSpaceMouse?: () => void;
  /** Current SpaceMouse global sensitivity multiplier. */
  spaceMouseSensitivity?: number;
  /** Called when the user moves the sensitivity slider. */
  onSpaceMouseSensitivityChange?: (value: number) => void;

  /**
   * Forwarded to the shared `Panel` chrome.  App.tsx passes `false` on
   * mobile viewports so the long Settings panel doesn't dominate the
   * first-paint screen on a phone; desktop keeps the previous always-
   * open behaviour.  Users can still tap the title row to expand.
   */
  defaultOpen?: boolean;

  // ── Scalar-volume overlay ───────────────────────────────────────────────
  //
  // All four props are optional so older call sites (and the Vitest snapshot
  // suite) continue to typecheck unchanged.  The whole section is gated on
  // all of them being present — same idiom as the filaments section above.
  //
  // `volumeFields` drives a list-driven layout: one row per registered field,
  // each with an enable checkbox and an intensity slider.  The list is rebuilt
  // whenever the engine fires `onVolumeFieldsChanged`, so adding a cube at
  // runtime appears immediately in the panel.
  //
  // `volumesEnabled` is the master toggle in the section header — same shape
  // as `filamentsEnabled` / the survey master checkbox.  Turning it off
  // silences every registered field without destroying their per-field
  // tunable state.

  /** Master on/off for all registered volume fields.  Optional — omitting hides the section. */
  volumesEnabled?: boolean;
  /** Fired when the user toggles the master "Volumes" checkbox. */
  onVolumesEnabledChange?: (enabled: boolean) => void;
  /**
   * Snapshot of every registered field's UI state — one entry per field.
   * Built by `engineHandle.volumes.getState()` on each
   * `onVolumeFieldsChanged` callback.  Optional — when absent the
   * Volumes section is hidden.
   */
  volumeFields?: ReadonlyArray<VolumeFieldRowData>;
  /** Fired when the user toggles an individual field's enable checkbox. */
  onVolumeFieldEnabledChange?: (handle: string, enabled: boolean) => void;
  /** Fired when the user moves an individual field's intensity slider. */
  onVolumeFieldIntensityChange?: (handle: string, intensity: number) => void;
  /**
   * Fired when the user moves an individual field's contrast slider.
   * Contrast widens a deadband around the value midpoint (suppressing
   * near-mean noise) while stretching the surviving range across the
   * full palette — visually distinct from intensity, which is an
   * overall opacity multiplier.
   */
  onVolumeFieldContrastChange?: (handle: string, contrast: number) => void;
  /**
   * Fired when the user moves an individual field's density slider.
   * `densityScale` is a per-cube opacity multiplier inside the alpha
   * integral; useful for compensating after windowing has hidden too
   * much of the value range, or for shaping a very thin / very dense
   * field to look "right".  Range is conventionally [0, 30], with
   * registry defaults sitting around 5 for the CF-4 cube.
   */
  onVolumeFieldDensityScaleChange?: (handle: string, value: number) => void;
  /**
   * Fired when the user moves an individual field's trim slider.
   * `trim` is a low-end cutoff in normalised LUT-coord space [0, 0.95]
   * that hard-suppresses voxels below the threshold — Polyphorm-style
   * `trim_density` exposed as a per-cube user knob.
   */
  onVolumeFieldTrimChange?: (handle: string, trim: number) => void;
  /**
   * Fired when the user moves an individual field's exposure slider.
   * `exposure` is a per-cube HDR multiplier on the rgb contribution
   * per ray-march step, range [1, 32].  Combined with the shader's
   * bright-end-weighted formula so peaks brighten (white blow-out)
   * while mid-tones stay LDR-bounded.
   */
  onVolumeFieldExposureChange?: (handle: string, exposure: number) => void;
  /**
   * Fired when the user picks a different palette from a field's dropdown.
   * Optional — when absent the per-field palette dropdown is hidden but
   * the rest of the row (enable checkbox + intensity slider) still
   * renders, so older call sites are unaffected.
   */
  onVolumeFieldPaletteChange?: (handle: string, id: ScalarFieldPaletteId) => void;
};

// ── SettingsPanel ──────────────────────────────────────────────────────────────

/**
 * Glassmorphic settings panel fixed to the bottom-left corner.
 *
 * The panel is always present in the DOM (unlike InfoCard, which is absent
 * when nothing is hovered). Its CSS lives in `index.html` under `#settings-panel`.
 *
 * @example
 * // In App.tsx:
 * <SettingsPanel
 *   pointSize={pointSize}
 *   brightness={brightness}
 *   autoRotate={autoRotate}
 *   onPointSizeChange={(v) => handleRef.current?.points.setSize(v)}
 *   onBrightnessChange={(v) => handleRef.current?.points.setBrightness(v)}
 *   onAutoRotateChange={(v) => handleRef.current?.camera.setAutoRotate(v)}
 *   onResetCamera={() => handleRef.current?.camera.reset()}
 * />
 */
export function SettingsPanel({
  pointSize,
  brightness,
  autoRotate,
  onPointSizeChange,
  onBrightnessChange,
  onAutoRotateChange,
  galaxyTexturesEnabled,
  onGalaxyTexturesChange,
  milkyWayEnabled,
  onMilkyWayEnabledChange,
  labelCategoryVisibility,
  onSetLabelCategoryVisibility,
  filamentsEnabled,
  onFilamentsChange,
  filamentIntensity,
  onFilamentIntensityChange,
  highlightFallback,
  onHighlightFallbackChange,
  realOnlyMode,
  onRealOnlyModeChange,
  depthFadeEnabled,
  onDepthFadeEnabledChange,
  onResetCamera,
  tier,
  onTierChange,
  visibleSourceMask,
  onToggleSource,
  sourceCounts,
  lodMode,
  onSetLodMode,
  spaceMouseSupported,
  spaceMouseConnected,
  onConnectSpaceMouse,
  spaceMouseSensitivity,
  onSpaceMouseSensitivityChange,
  biasMode,
  onBiasModeChange,
  absMagLimit,
  onAbsMagLimitChange,
  toneMapCurve,
  onToneMapCurveChange,
  exposure,
  onExposureChange,
  defaultOpen,
  volumesEnabled,
  onVolumesEnabledChange,
  volumeFields,
  onVolumeFieldEnabledChange,
  onVolumeFieldIntensityChange,
  onVolumeFieldContrastChange,
  onVolumeFieldDensityScaleChange,
  onVolumeFieldTrimChange,
  onVolumeFieldExposureChange,
  onVolumeFieldPaletteChange,
}: Props): ReactNode {
  // Tier selector: rendered only when both pieces wired by the parent.  Same
  // opt-in idiom as every other optional section in this panel.  The selector
  // sits at the top of the body (before any CollapsibleSection) because the
  // tier choice has the highest blast radius — it triggers a network re-fetch
  // and full GPU re-upload of every tiered source.
  const showTierSelector = tier !== undefined && onTierChange !== undefined;

  // Guard: only render the survey-toggle section when the parent has wired
  // *both* the current mask and the toggle callback. Either alone would be
  // a half-broken UI (toggles that don't reflect state, or state with no
  // way to change it), so we treat them as a single feature flag.
  const showSurveyToggles = visibleSourceMask !== undefined && onToggleSource !== undefined;

  // Same pattern for the LOD section: rendered only when both pieces are
  // present. `lodMode` may legitimately be the string `'auto'`, so compare
  // against `undefined` explicitly rather than relying on truthiness.
  const showLodControls = lodMode !== undefined && onSetLodMode !== undefined;

  // Orientation-visibility section: rendered only when both toggle pieces are
  // wired by the parent.  Same gating pattern as the survey + LOD sections.
  const showOrientationToggles =
    highlightFallback !== undefined &&
    onHighlightFallbackChange !== undefined &&
    realOnlyMode !== undefined &&
    onRealOnlyModeChange !== undefined;

  // Milky Way checkbox: rendered only when both the value and the
  // change-callback are wired by the parent.  Same opt-in idiom as
  // every other optional section in this panel.
  const showMilkyWayToggle = milkyWayEnabled !== undefined && onMilkyWayEnabledChange !== undefined;

  // Filaments checkbox: same opt-in idiom — both pieces or neither.
  // On a fresh clone the underlying `filaments.bin` won't exist; the
  // panel still renders the row (so the user can discover the
  // feature), but toggling it on is a silent no-op until they run
  // `npm run build-filaments`.  We deliberately do NOT gate visibility
  // on whether the binary loaded — discoverability of the feature
  // beats hiding rows whose backing data may show up later.
  const showFilamentsToggle = filamentsEnabled !== undefined && onFilamentsChange !== undefined;
  // Intensity slider only shows when both prop pieces are provided AND the
  // overlay is currently enabled.  Hiding it when the toggle is off keeps
  // the slider from looking dead — moving it would have no visible effect.
  const showFilamentIntensitySlider =
    showFilamentsToggle &&
    filamentsEnabled === true &&
    filamentIntensity !== undefined &&
    onFilamentIntensityChange !== undefined;

  // Volumes section: all five props must be wired or we hide the section.
  // Requiring all five (master toggle + master callback + field list + field
  // callbacks) prevents a half-rendered UI where the master checkbox exists
  // but per-field rows can't respond, or vice versa.  Older call sites that
  // pass none of them still see no Volumes section at all.
  const showVolumesSection =
    volumesEnabled !== undefined &&
    onVolumesEnabledChange !== undefined &&
    volumeFields !== undefined &&
    onVolumeFieldEnabledChange !== undefined &&
    onVolumeFieldIntensityChange !== undefined;


  // Density-correction section: rendered only when both the current mode and
  // both change-callbacks are wired by the parent.  We require all four
  // density props (mode + mode-callback + magnitude + magnitude-callback)
  // so that, when the user flips into VolumeLimited mode, the slider works
  // immediately rather than half-rendering.  Older call sites that pass
  // none of them still see no Density-correction section at all.
  const showBiasControls =
    biasMode !== undefined &&
    onBiasModeChange !== undefined &&
    absMagLimit !== undefined &&
    onAbsMagLimitChange !== undefined;

  // Tone-curve selector: same opt-in idiom — both props must be wired or
  // we hide the whole row.  No `disabled` fallback because every curve
  // option ships functional today (no future placeholders to gray out,
  // unlike the biasMode dropdown's roadmap entries).
  const showToneCurveControls = toneMapCurve !== undefined && onToneMapCurveChange !== undefined;

  // Exposure slider gate — independent of the tone-curve dropdown so a
  // caller can wire one without the other (mostly defensive: in practice
  // App.tsx wires both together).  Same idiom as every other optional
  // section in this panel.
  const showExposureControl = exposure !== undefined && onExposureChange !== undefined;

  // The glassmorphic card chrome + clickable uppercase title row + body
  // collapse affordance live in the shared `Panel` component (see
  // `components/common/Panel`).  Collapse state is session-only, defaulting
  // open so first-time visitors see the panel as the primary interaction
  // surface.  This module just supplies the section content.
  return (
    <Panel title="Settings" ariaLabel="Renderer settings" defaultOpen={defaultOpen}>
      {/*
        ── Section grouping ──────────────────────────────────────────────
        The panel grew to ~80 controls in seven loose categories.  Wrapping
        each category in a CollapsibleSection turns "scroll a wall of rows"
        into "open the section you care about".  Each section persists its
        open/closed state to localStorage under a unique key so the user's
        layout choices survive reloads.

        Section order is intentional: catalog choices first (what to look
        at), then bias correction (which sub-sample), then visual + tone
        (how the pixels are shaped), then overlays (decorations on top),
        then orientation visibility (debug-ish), then input (rare).
        Camera reset stays outside any section as a footer.
      */}

          {/* ── Data tier (small / medium / large) ──────────────────────────── */}
          {/*
        Top-of-body placement (before any CollapsibleSection) is intentional:
        the tier choice is the highest-blast-radius control on the panel —
        each click triggers a network re-fetch + GPU re-upload of every
        tiered source.  Putting it at the top makes it both discoverable
        and unambiguous which decision came first.

        Always visible (no CollapsibleSection wrapper) for the same reason:
        the user should never have to "find" the tier control before
        understanding why their device is hot.
      */}
          {showTierSelector && (
            <TierSelector tier={tier!} onTierChange={onTierChange!} />
          )}

          {/* ── Surveys ──────────────────────────────────────────────────────── */}
          {/*
        Survey toggles are the highest-level decision the user makes — what
        catalogues are even on screen.  Default closed to keep the Settings
        panel scannable on first open; the section header still surfaces the
        master tri-state checkbox so the all-on/mixed/all-off state is
        visible without expanding the section.

        Master toggle in the section header is a *derived tri-state* over the
        per-source booleans:
          - all four on → checked, NOT indeterminate
          - all four off → unchecked, NOT indeterminate
          - mixed → unchecked + indeterminate (visual dash)
        Click semantics follow the standard tri-state convention: from the
        "none" state, set everything on; from any other state (all or
        partial), set everything off.  This mirrors how OS file-managers
        treat tri-state group checkboxes.

        Note we deliberately do NOT use a single bitmask write — the
        callback contract is `onToggleSource(Source, boolean)` per source,
        so we loop and emit one call per source.  The parent handles each
        update through its existing reducer.
      */}
          {showSurveyToggles &&
            (() => {
              // Derived tri-state.  Counted once per render rather than
              // peppering `maskHas(...)` into the boolean expressions
              // below — keeps the intent legible and avoids three bitwise
              // reads when one suffices.
              const enabledCount = TOGGLEABLE_SOURCES.reduce<number>(
                (n, s) => (maskHas(visibleSourceMask, s) ? n + 1 : n),
                0,
              );
              const allOn = enabledCount === TOGGLEABLE_SOURCES.length;
              const noneOn = enabledCount === 0;
              const indeterminate = !allOn && !noneOn;

              // Master click handler: from "none" → set all on; from
              // "all" or "mixed" → clear everything.  This is the
              // conventional tri-state-checkbox UX (Windows Explorer,
              // macOS Finder list-view, GitHub PR file-tree, etc.).
              const onMasterToggle = () => {
                const targetEnabled = noneOn; // true if currently all off
                for (const s of TOGGLEABLE_SOURCES) {
                  onToggleSource(s, targetEnabled);
                }
              };

              return (
                <CollapsibleSection
                  title="Surveys"
                  headerToggle={allOn}
                  headerToggleIndeterminate={indeterminate}
                  onHeaderToggleChange={onMasterToggle}
                >
                  {TOGGLEABLE_SOURCES.map((s) => {
                    // `count` is undefined until the .bin lands; we render an empty
                    // string in that case rather than "0" (which would imply the
                    // survey is empty rather than still loading).
                    const count = sourceCounts?.[s];
                    return (
                      <div className={styles.panelRow} key={s}>
                        <label htmlFor={`toggle-source-${s}`}>
                          {sourceLabel(s)}
                          {count !== undefined && (
                            <span className={styles.sourceCount}>
                              {count.toLocaleString()}
                            </span>
                          )}
                        </label>
                        <input
                          id={`toggle-source-${s}`}
                          type="checkbox"
                          // `maskHas` keeps us from leaking the bitmask shape into the JSX —
                          // we ask "is bit s set?" and trust `data/sources.ts` to know how.
                          checked={maskHas(visibleSourceMask, s)}
                          onChange={(e) => onToggleSource(s, e.target.checked)}
                        />
                      </div>
                    );
                  })}
                </CollapsibleSection>
              );
            })()}

          {/* ── Filaments (cosmic web) ───────────────────────────────────────── */}
          {/*
        Dedicated section, sitting immediately below Surveys because both
        sections answer the same kind of question — "which large-scale
        structure am I rendering?".  The master toggle in the header
        mirrors the previous "Filaments" checkbox row that lived inside
        Overlays; the intensity slider that used to sit alongside it
        moves into this section's body and only renders when the
        overlay is enabled (matches the previous gating).

        On a fresh clone, `filaments.bin` doesn't exist yet — the engine
        treats the missing file as a silent no-op, so toggling this on
        is a discoverable affordance even before the user runs
        `npm run build-filaments`.

        Default-closed (`defaultOpen={false}`) because most first-time
        visitors aren't yet familiar with the cosmic-web overlay; folding
        it away keeps the panel compact while still discoverable via the
        master checkbox visible in the collapsed-section header.
      */}
          {showFilamentsToggle && (
            <CollapsibleSection
              title="Filaments (cosmic web)"
              headerToggle={filamentsEnabled}
              onHeaderToggleChange={(v) => onFilamentsChange(v)}
            >
              {showFilamentIntensitySlider ? (
                <>
                  <div className={styles.panelRow}>
                    <label htmlFor="filament-intensity">Intensity</label>
                    <span className={styles.panelValue}>
                      {filamentIntensity.toFixed(2)}
                    </span>
                  </div>
                  <div className={styles.panelRow}>
                    <input
                      id="filament-intensity"
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={filamentIntensity}
                      onChange={(e) => onFilamentIntensityChange(Number(e.target.value))}
                    />
                  </div>
                </>
              ) : (
                // When the overlay is OFF, the slider is hidden (it
                // would have no visible effect on the canvas) — but
                // we still render a subtle hint inside the body so a
                // user who expanded the section sees *why* there's
                // nothing to drag.  This matches the pattern used by
                // the SpaceMouse section's "not connected" hint.
                <div className={styles.panelMode}>enable to adjust intensity</div>
              )}
            </CollapsibleSection>
          )}

          {/* ── Scalar-volume overlay ───────────────────────────────────────── */}
          {/*
        List-driven section: one row per registered field, each with an
        enable checkbox and an intensity slider.  The field list is rebuilt
        whenever the engine fires `onVolumeFieldsChanged` (add/remove), so
        registering a cube at runtime causes this section to grow a new row
        without any manual refresh.

        The master checkbox in the section header follows the same pattern
        as the Filaments toggle: clicking it does NOT expand/collapse — the
        collapse chevron handles that.  The checkbox acts as a coarse "hide
        all volumes" emergency off while preserving per-field tunable state.

        Empty-state hint: when no fields are registered yet, the body shows
        a faint italic line rather than an empty white box — same idiom the
        SpaceMouse section uses for its "not connected" hint.

        Default-closed (`defaultOpen` omitted, so it falls back to
        `false`) because no fields are registered on first paint; the
        user only needs this section when they've explicitly loaded a cube.
      */}
          {showVolumesSection && (
            <CollapsibleSection
              title="Volumes"
              headerToggle={volumesEnabled}
              onHeaderToggleChange={(v) => onVolumesEnabledChange!(v)}
            >
              {volumeFields!.length === 0 ? (
                // Empty state — no cubes registered yet.  The hint mirrors the
                // SpaceMouse "not connected" line in style (panelMode) so the
                // visual vocabulary stays consistent.  The user discovers the
                // feature exists here and knows to call `addVolumeField` to
                // populate it.
                <div className={styles.panelMode}>No volume fields registered.</div>
              ) : (
                volumeFields!.map((field) => (
                  <VolumeFieldRow
                    key={field.handle}
                    handle={field.handle}
                    label={field.label}
                    enabled={field.enabled}
                    intensity={field.intensity}
                    contrast={field.contrast}
                    densityScale={field.densityScale}
                    trim={field.trim}
                    exposure={field.exposure}
                    paletteId={field.paletteId}
                    onEnabledChange={onVolumeFieldEnabledChange!}
                    onIntensityChange={onVolumeFieldIntensityChange!}
                    onContrastChange={onVolumeFieldContrastChange!}
                    onTrimChange={onVolumeFieldTrimChange}
                    onExposureChange={onVolumeFieldExposureChange}
                    onDensityScaleChange={onVolumeFieldDensityScaleChange}
                    onPaletteChange={onVolumeFieldPaletteChange}
                  />
                ))
              )}
            </CollapsibleSection>
          )}

          {/* ── Density correction (Malmquist bias) ──────────────────────────── */}
          {/*
        Sits just below Surveys because density correction is a high-level
        decision about *what sub-sample of the catalog to render* — closer in
        spirit to a survey toggle than to a per-pixel slider.  Only the first
        two modes do anything visible today (Tasks 3 + 4 add the 1/V_max and
        Schechter implementations); the future modes are kept in the dropdown
        but `disabled`, both as a roadmap signal and so the menu's vertical
        layout doesn't shift when those tasks land.

        The M_lim slider is conditionally rendered only in VolumeLimited mode
        because the other modes don't use a hard absolute-magnitude threshold:
        1/V_max weights every galaxy individually, and Schechter reweights by
        the analytic luminosity function (see plan Task 3 + 4 sketches).
        Hiding the control rather than disabling it keeps the panel compact
        and removes a UI element that would just look broken.
      */}
          {showBiasControls && (
            <CollapsibleSection title="Density correction">
              <div className={styles.panelRow}>
                <label htmlFor="bias-mode">Mode</label>
                <select
                  id="bias-mode"
                  className={styles.modeSelect}
                  value={biasMode}
                  onChange={(e) => onBiasModeChange(Number(e.target.value) as BiasModeT)}
                >
                  <option value={BiasMode.None}>None — raw catalogue</option>
                  <option value={BiasMode.VolumeLimited}>Volume-limited</option>
                  <option value={BiasMode.VMax}>1/V_max</option>
                  <option value={BiasMode.Schechter}>Schechter LF</option>
                  <option value={BiasMode.AngularReweight}>Angular re-weight (HEALPix)</option>
                </select>
              </div>
              {biasMode === BiasMode.VolumeLimited && (
                <>
                  <div className={styles.panelRow}>
                    <label htmlFor="abs-mag-limit">M_lim</label>
                    <span className={styles.panelValue}>{absMagLimit.toFixed(1)}</span>
                  </div>
                  <div className={styles.panelRow}>
                    <input
                      id="abs-mag-limit"
                      type="range"
                      min={-24}
                      max={-15}
                      step={0.1}
                      value={absMagLimit}
                      onChange={(e) => onAbsMagLimitChange(parseFloat(e.target.value))}
                    />
                  </div>
                </>
              )}
            </CollapsibleSection>
          )}

          {/* ── Visual (per-pixel sliders + camera behaviour) ───────────────── */}
          {/*
        Bundles the four "how the pixels are drawn" controls together:
        point size, brightness, depth fade, and auto-rotate, plus the
        Auto-LOD master switch (which is camera-distance gating, same
        family of "rendering behaviour" knobs).  These are the controls
        a user reaches for *after* they've decided what surveys to view.
      */}
          <CollapsibleSection title="Visual">
            {/* Point size — stacked label/value on top, slider full-width below. */}
            <div className={styles.panelRow}>
              <label htmlFor="slider-point-size">Point size</label>
              <span className={styles.panelValue}>{pointSize.toFixed(1)} px</span>
            </div>
            <div className={styles.panelRow}>
              <input
                id="slider-point-size"
                type="range"
                min={1.0}
                max={8.0}
                step={0.1}
                value={pointSize}
                onChange={(e) => onPointSizeChange(parseFloat(e.target.value))}
              />
            </div>

            {/* Brightness */}
            <div className={styles.panelRow}>
              <label htmlFor="slider-brightness">Brightness</label>
              <span className={styles.panelValue}>{brightness.toFixed(2)}×</span>
            </div>
            <div className={styles.panelRow}>
              <input
                id="slider-brightness"
                type="range"
                min={0.2}
                max={3.0}
                step={0.05}
                value={brightness}
                onChange={(e) => onBrightnessChange(parseFloat(e.target.value))}
              />
            </div>

            {/*
          Depth-fade toggle.  Camera-distance attenuation that gates centre-
          of-volume saturation glow.  Belongs here in Visual because it's a
          per-pixel modulation, even though it gets gated on its own pair of
          props (the parent may not wire it).
        */}
            {depthFadeEnabled !== undefined && onDepthFadeEnabledChange !== undefined && (
              <div className={styles.panelRow}>
                <label htmlFor="toggle-depth-fade">Depth fade</label>
                <input
                  id="toggle-depth-fade"
                  type="checkbox"
                  checked={depthFadeEnabled}
                  onChange={(e) => onDepthFadeEnabledChange(e.target.checked)}
                />
              </div>
            )}

            {/* Auto-rotate */}
            <div className={styles.panelRow}>
              <label htmlFor="toggle-auto-rotate">Auto-rotate</label>
              <input
                id="toggle-auto-rotate"
                type="checkbox"
                checked={autoRotate}
                // `e.target.checked` is a boolean — pass it directly to the callback.
                onChange={(e) => onAutoRotateChange(e.target.checked)}
              />
            </div>

            {/* ── Auto-LOD master switch ──────────────────────────────────────
          A single boolean checkbox is enough because the engine itself has
          only two modes: pick LOD from camera distance, or honour an
          explicit caller override. The mode-indicator line below the
          checkbox echoes the current state so the wording stays
          unambiguous even when the user isn't sure what "Auto LOD off"
          implies. */}
            {showLodControls && (
              <>
                <div className={styles.panelRow}>
                  <label htmlFor="toggle-auto-lod">Auto LOD</label>
                  <input
                    id="toggle-auto-lod"
                    type="checkbox"
                    checked={lodMode === 'auto'}
                    onChange={(e) => onSetLodMode(e.target.checked ? 'auto' : 'manual')}
                  />
                </div>
                <div className={styles.panelMode}>
                  mode: {lodMode === 'auto' ? 'auto (by zoom)' : 'manual override'}
                </div>
              </>
            )}
          </CollapsibleSection>

          {/* ── Tone mapping ─────────────────────────────────────────────────── */}
          {/*
        Curve dropdown + exposure slider.  The two work together: curve
        choice sets the shape (Linear / Reinhard / Asinh / Gamma 2 / ACES),
        exposure sets where on that shape the per-pixel signal lands.  See
        `data/toneMapCurve.ts` for the full curve descriptions.
      */}
          {(showToneCurveControls || showExposureControl) && (
            <CollapsibleSection title="Tone mapping">
              {showToneCurveControls && (
                <div className={styles.panelRow}>
                  <label htmlFor="tonemap-curve">Curve</label>
                  <select
                    id="tonemap-curve"
                    className={styles.modeSelect}
                    value={toneMapCurve}
                    onChange={(e) =>
                      onToneMapCurveChange(parseInt(e.target.value, 10) as ToneMapCurveT)
                    }
                  >
                    {ALL_TONE_MAP_CURVES.map((c) => (
                      <option key={c} value={c}>
                        {toneMapCurveLabel(c)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {/*
            Exposure multiplies the HDR signal *before* the tone-map curve
            runs, so dragging it left dims cluster cores back below
            saturation and dragging it right lifts the cosmic web out of
            the noise floor.  The engine clamps to [0.05, 16]; we cap the
            slider at 4.0 because anything past ~3 already over-bakes the
            brightest cores under Reinhard / ACES.
          */}
              {showExposureControl && (
                <>
                  <div className={styles.panelRow}>
                    <label htmlFor="slider-exposure">Exposure</label>
                    <span className={styles.panelValue}>{exposure.toFixed(2)}×</span>
                  </div>
                  <div className={styles.panelRow}>
                    <input
                      id="slider-exposure"
                      type="range"
                      min={0.1}
                      max={4.0}
                      step={0.05}
                      value={exposure}
                      onChange={(e) => onExposureChange(parseFloat(e.target.value))}
                    />
                  </div>
                </>
              )}
            </CollapsibleSection>
          )}

          {/* ── Overlays ─────────────────────────────────────────────────────── */}
          {/*
        Decorative passes that draw *on top of* the main galaxy point cloud:
        the close-up galaxy thumbnails and the procedural Milky Way impostor
        at world origin.  Both are independent toggles — turning one off
        doesn't affect the other.

        The Filaments overlay used to live here too, but graduated into its
        own dedicated CollapsibleSection (immediately below Surveys) once
        its master toggle moved to the section header and the intensity
        slider needed a stable home.  See the "Filaments (cosmic web)"
        section above for the new layout.
      */}
          <CollapsibleSection title="Overlays">
            {/*
          Galaxy thumbnails — gates the entire close-up galaxy-texture quad
          pass.  Default-on (the engine seeds `true` at init), so first-time
          visitors see the feature without having to opt in.
        */}
            <div className={styles.panelRow}>
              <label htmlFor="toggle-galaxy-textures">Galaxy thumbnails</label>
              <input
                id="toggle-galaxy-textures"
                type="checkbox"
                checked={galaxyTexturesEnabled}
                onChange={(e) => onGalaxyTexturesChange(e.target.checked)}
              />
            </div>

            {showMilkyWayToggle && (
              <div className={styles.panelRow}>
                <label htmlFor="toggle-milky-way">Show Milky Way</label>
                <input
                  id="toggle-milky-way"
                  type="checkbox"
                  checked={milkyWayEnabled}
                  onChange={(e) => onMilkyWayEnabledChange(e.target.checked)}
                />
              </div>
            )}

            {/*
              Per-category label-visibility toggles.  Four checkboxes matching
              the PoiCategory union — always visible, no feature gate, because
              famous-galaxy labels especially are first-class user-facing
              overlays.  Not wrapped in its own CollapsibleSection — four rows
              isn't enough to justify the click cost of expanding a sub-section.
            */}
            <div className={styles.panelRow}>
              <label htmlFor="toggle-label-cluster">Cluster labels</label>
              <input
                id="toggle-label-cluster"
                type="checkbox"
                checked={labelCategoryVisibility.cluster}
                onChange={(e) => onSetLabelCategoryVisibility('cluster', e.target.checked)}
              />
            </div>
            <div className={styles.panelRow}>
              <label htmlFor="toggle-label-supercluster">Supercluster labels</label>
              <input
                id="toggle-label-supercluster"
                type="checkbox"
                checked={labelCategoryVisibility.supercluster}
                onChange={(e) => onSetLabelCategoryVisibility('supercluster', e.target.checked)}
              />
            </div>
            <div className={styles.panelRow}>
              <label htmlFor="toggle-label-famous-galaxy">Famous galaxy labels</label>
              <input
                id="toggle-label-famous-galaxy"
                type="checkbox"
                checked={labelCategoryVisibility.famousGalaxy}
                onChange={(e) => onSetLabelCategoryVisibility('famousGalaxy', e.target.checked)}
              />
            </div>
            <div className={styles.panelRow}>
              <label htmlFor="toggle-label-void">Void labels</label>
              <input
                id="toggle-label-void"
                type="checkbox"
                checked={labelCategoryVisibility.void}
                onChange={(e) => onSetLabelCategoryVisibility('void', e.target.checked)}
              />
            </div>
          </CollapsibleSection>

          {/* ── Orientation visibility (Task 15) ─────────────────────────────── */}
          {/*
        Two toggles that share the same per-galaxy fallback flag (sign bit of
        axisRatio, baked at upload time).  "Highlight" tints fallback
        rows magenta in the fragment shader; "Show only real" discards
        fallback fragments entirely.  Both default off so existing visual
        behaviour is unchanged until the user opts in.

        Default-closed because these are debug-ish: most users never touch
        them, but fallback-orientation diagnostic work needs them.
      */}
          {showOrientationToggles && (
            <CollapsibleSection title="Orientation">
              <div className={styles.panelRow}>
                <label htmlFor="toggle-highlight-fallback">Highlight fallback</label>
                <input
                  id="toggle-highlight-fallback"
                  type="checkbox"
                  checked={highlightFallback}
                  onChange={(e) => onHighlightFallbackChange(e.target.checked)}
                />
              </div>
              <div className={styles.panelRow}>
                <label htmlFor="toggle-real-only">Show only real</label>
                <input
                  id="toggle-real-only"
                  type="checkbox"
                  checked={realOnlyMode}
                  onChange={(e) => onRealOnlyModeChange(e.target.checked)}
                />
              </div>
            </CollapsibleSection>
          )}

          {/* ── SpaceMouse (rev-3 6DOF input) ────────────────────────────────── */}
          {/*
        Rendered only when WebHID is available (Chromium-only). On Firefox
        and Safari the parent passes `spaceMouseSupported={false}` and this
        whole section is hidden — users see no broken UI for an inaccessible
        feature. Within the section, the Connect button shows up only when
        no device is paired, and the sensitivity slider only after pairing.

        Default-closed because most users don't have a SpaceMouse plugged
        in even on supported browsers.
      */}
          {spaceMouseSupported && (
            <CollapsibleSection title="SpaceMouse">
              <div className={styles.panelMode}>
                {spaceMouseConnected ? 'connected' : 'not connected'}
              </div>
              {!spaceMouseConnected && onConnectSpaceMouse && (
                <div className={styles.panelRow}>
                  <button
                    type="button"
                    className={styles.button}
                    onClick={onConnectSpaceMouse}
                  >
                    Connect SpaceMouse
                  </button>
                </div>
              )}
              {spaceMouseConnected &&
                spaceMouseSensitivity !== undefined &&
                onSpaceMouseSensitivityChange && (
                  <>
                    <div className={styles.panelRow}>
                      <label htmlFor="slider-spacemouse-sensitivity">Sensitivity</label>
                      <span className={styles.panelValue}>{spaceMouseSensitivity.toFixed(2)}×</span>
                    </div>
                    <div className={styles.panelRow}>
                      <input
                        id="slider-spacemouse-sensitivity"
                        type="range"
                        min={0.1}
                        max={3.0}
                        step={0.05}
                        value={spaceMouseSensitivity}
                        onChange={(e) => onSpaceMouseSensitivityChange(parseFloat(e.target.value))}
                      />
                    </div>
                  </>
                )}
            </CollapsibleSection>
          )}

          {/* ── Footer: divider + reset camera ──────────────────────────────── */}
          {/*
        Reset camera lives outside any section because it's an action, not
        a setting — it doesn't belong in any of the configuration buckets
        above, and folding it away would hide the panel's primary "I'm
        lost, take me home" affordance.
      */}
      <div className={styles.panelDivider} role="separator" />
      <button type="button" className={styles.button} onClick={onResetCamera}>
        Reset camera
      </button>
    </Panel>
  );
}

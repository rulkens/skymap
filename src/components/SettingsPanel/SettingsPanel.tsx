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
 *   User drags slider → onChange prop fires → App.tsx calls handle.setPointSize
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

import { useState, type ReactNode } from 'react';
import type { LodMode } from '../../@types/LodMode';
import { Source, sourceLabel, maskHas } from '../../data/sources';
import { BiasMode } from '../../data/biasMode';
import {
  ToneMapCurve,
  ALL_TONE_MAP_CURVES,
  toneMapCurveLabel,
} from '../../data/toneMapCurve';
import { CollapsibleSection } from './CollapsibleSection';
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
const TOGGLEABLE_SOURCES: readonly Source[] = [
  Source.SDSS,
  Source.TwoMRS,
  Source.Glade,
  Source.Famous,
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
  biasMode?: BiasMode;
  /** Called when the user picks a different density-correction mode. */
  onBiasModeChange?: (mode: BiasMode) => void;
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
  toneMapCurve?: ToneMapCurve;
  /** Called when the user picks a different tone-map curve. */
  onToneMapCurveChange?: (curve: ToneMapCurve) => void;
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
 *   onPointSizeChange={(v) => handleRef.current?.setPointSize(v)}
 *   onBrightnessChange={(v) => handleRef.current?.setBrightness(v)}
 *   onAutoRotateChange={(v) => handleRef.current?.setAutoRotate(v)}
 *   onResetCamera={() => handleRef.current?.resetCamera()}
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
  filamentsEnabled,
  onFilamentsChange,
  highlightFallback,
  onHighlightFallbackChange,
  realOnlyMode,
  onRealOnlyModeChange,
  depthFadeEnabled,
  onDepthFadeEnabledChange,
  onResetCamera,
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
}: Props): ReactNode {
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
  const showMilkyWayToggle =
    milkyWayEnabled !== undefined && onMilkyWayEnabledChange !== undefined;

  // Filaments checkbox: same opt-in idiom — both pieces or neither.
  // On a fresh clone the underlying `filaments.bin` won't exist; the
  // panel still renders the row (so the user can discover the
  // feature), but toggling it on is a silent no-op until they run
  // `npm run build-filaments`.  We deliberately do NOT gate visibility
  // on whether the binary loaded — discoverability of the feature
  // beats hiding rows whose backing data may show up later.
  const showFilamentsToggle =
    filamentsEnabled !== undefined && onFilamentsChange !== undefined;

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
  const showToneCurveControls =
    toneMapCurve !== undefined && onToneMapCurveChange !== undefined;

  // Exposure slider gate — independent of the tone-curve dropdown so a
  // caller can wire one without the other (mostly defensive: in practice
  // App.tsx wires both together).  Same idiom as every other optional
  // section in this panel.
  const showExposureControl =
    exposure !== undefined && onExposureChange !== undefined;

  // ── Collapse state ─────────────────────────────────────────────────────
  //
  // Local UI-only state — no engine implications, no echo callback needed.
  // Default OPEN because the panel is the primary interaction surface;
  // users discover its existence on first paint.  Once they know it's
  // there, they can fold it away to reclaim the bottom-left corner.
  // Session-only by design: a user reload starts open again so the panel
  // doesn't appear "missing" on a fresh visit.  localStorage persistence
  // is a separate concern (matches the engine's own treatment of bias
  // mode, exposure, etc. — none of those persist across reloads either).
  const [collapsed, setCollapsed] = useState<boolean>(false);

  return (
    <div className={styles.settingsPanel} aria-label="Renderer settings">
      {/* ── Title + collapse toggle ──────────────────────────────────────── */}
      {/*
        Title doubles as the click target for collapse/expand.  Using a real
        <button> rather than the styled-div approach keeps keyboard focus +
        Enter/Space activation working without a custom onKeyDown handler,
        and `aria-expanded` lets screen readers announce the current state.
        The button styles itself to look like the existing title — no visual
        change when not interacting — but stretches across the panel width
        so the entire title row is clickable.
      */}
      <button
        type="button"
        className={styles.panelTitleButton}
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        aria-controls="settings-panel-body"
      >
        {/*
          Chevron sits LEFT of the heading, styled like a list-marker /
          tree-twirl rather than a right-side dropdown affordance.  This
          reads visually as "a header with a fold indicator" rather than
          "a button I should press" — the user's complaint earlier.
          The whole row stays clickable (cursor: pointer on hover) so
          discoverability is unchanged.
        */}
        <span className={styles.panelTitleChevron} aria-hidden>
          {collapsed ? '▸' : '▾'}
        </span>
        <span className={styles.panelTitle}>Settings</span>
      </button>

      {/*
        Body — everything below the title is hidden when collapsed.  We
        wrap in an `id`-bearing div so `aria-controls` on the title button
        points at a real element.  Conditional render rather than a CSS
        `display: none` so React doesn't pay for the off-screen DOM
        tree — the panel is large.
      */}
      {!collapsed && (
      <div id="settings-panel-body" className={styles.panelContent}>

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

      {/* ── Surveys ──────────────────────────────────────────────────────── */}
      {/*
        Survey toggles are the highest-level decision the user makes — what
        catalogues are even on screen.  Default open so a first-time visitor
        immediately sees the four toggles and the per-survey object counts.
      */}
      {showSurveyToggles && (
        <CollapsibleSection title="Surveys" storageKey="settings.section.surveys">
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
                    <span className={styles.sourceCount}>{count.toLocaleString()}</span>
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
        <CollapsibleSection
          title="Density correction"
          storageKey="settings.section.density"
        >
          <div className={styles.panelRow}>
            <label htmlFor="bias-mode">Mode</label>
            <select
              id="bias-mode"
              className={styles.modeSelect}
              value={biasMode}
              onChange={(e) => onBiasModeChange(Number(e.target.value) as BiasMode)}
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
      <CollapsibleSection title="Visual" storageKey="settings.section.visual">
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
        <CollapsibleSection title="Tone mapping" storageKey="settings.section.tone">
          {showToneCurveControls && (
            <div className={styles.panelRow}>
              <label htmlFor="tonemap-curve">Curve</label>
              <select
                id="tonemap-curve"
                className={styles.modeSelect}
                value={toneMapCurve}
                onChange={(e) =>
                  onToneMapCurveChange(parseInt(e.target.value, 10) as ToneMapCurve)
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
        the close-up galaxy thumbnails, the procedural Milky Way impostor at
        world origin, and the cosmic-web filament skeleton from DisPerSE.
        All three are independent toggles — turning one off doesn't affect
        the others.
      */}
      <CollapsibleSection title="Overlays" storageKey="settings.section.overlays">
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
          Filaments — optional opt-in overlay.  The underlying `filaments.bin`
          only exists after `npm run build-filaments` (which depends on the
          DisPerSE binary the user installs themselves), so we default the
          toggle OFF and the engine treats the missing file as a silent
          no-op.  Showing the row regardless of whether the binary loaded is
          a deliberate discoverability choice — the user sees the
          affordance, runs the build pipeline, comes back and toggles it on
          without us having to wire a "is it loaded?" flag through the panel.
        */}
        {showFilamentsToggle && (
          <div className={styles.panelRow}>
            <label htmlFor="toggle-filaments">Filaments (cosmic web)</label>
            <input
              id="toggle-filaments"
              type="checkbox"
              checked={filamentsEnabled}
              onChange={(e) => onFilamentsChange(e.target.checked)}
            />
          </div>
        )}
      </CollapsibleSection>

      {/* ── Orientation visibility (Task 15) ─────────────────────────────── */}
      {/*
        Two toggles that share the same per-galaxy fallback flag (high bit of
        globalInstanceIdx, baked at upload time).  "Highlight" tints fallback
        rows magenta in the fragment shader; "Show only real" discards
        fallback fragments entirely.  Both default off so existing visual
        behaviour is unchanged until the user opts in.

        Default-closed because these are debug-ish: most users never touch
        them, but fallback-orientation diagnostic work needs them.
      */}
      {showOrientationToggles && (
        <CollapsibleSection
          title="Orientation"
          storageKey="settings.section.orientation"
          defaultOpen={false}
        >
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
        <CollapsibleSection
          title="SpaceMouse"
          storageKey="settings.section.spacemouse"
          defaultOpen={false}
        >
          <div className={styles.panelMode}>
            {spaceMouseConnected ? 'connected' : 'not connected'}
          </div>
          {!spaceMouseConnected && onConnectSpaceMouse && (
            <div className={styles.panelRow}>
              <button type="button" onClick={onConnectSpaceMouse}>
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
                  <span className={styles.panelValue}>
                    {spaceMouseSensitivity.toFixed(2)}×
                  </span>
                </div>
                <div className={styles.panelRow}>
                  <input
                    id="slider-spacemouse-sensitivity"
                    type="range"
                    min={0.1}
                    max={3.0}
                    step={0.05}
                    value={spaceMouseSensitivity}
                    onChange={(e) =>
                      onSpaceMouseSensitivityChange(parseFloat(e.target.value))
                    }
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
      <button type="button" onClick={onResetCamera}>
        Reset camera
      </button>
      </div>
      )}
    </div>
  );
}

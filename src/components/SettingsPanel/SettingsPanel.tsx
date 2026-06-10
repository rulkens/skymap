/**
 * SettingsPanel — explorer-facing controls for the renderer.
 *
 * ### What this panel is for (post-2026-05-19 UX audit)
 *
 * Re-derived from first principles in the SettingsPanel UX audit (see
 * `docs/grill-sessions/settings-panel-audit-2026-05-19.md`).  The
 * pre-audit panel had grown organically to ~10 sections and ~20 always-
 * visible controls, optimised for "everyone at once".  The audit picked
 * the **curious explorer / amateur astronomer** as the primary audience
 * and re-organised around four thematic groups that mirror the explorer's
 * mental model of the scene:
 *
 *   1. **Galaxies** — the points themselves.  Master toggle + a
 *      default-open "Surveys" sub-disclosure (per-catalog toggles) +
 *      Advanced (render tunables).
 *   2. **Cosmic web** — the diffuse stuff *between* galaxies (volume
 *      density fields + DisPerSE filaments).  Master toggle + a Style
 *      picker (Smooth / Filaments / Both) + Advanced.
 *   3. **Structures** — clusters / superclusters / voids as marker rings.
 *      Master toggle + per-category checkboxes inline (no Advanced
 *      sub-disclosure — there are no other knobs to hide).
 *   4. **Labels** — every text annotation in the scene (cluster names,
 *      "you are here", famous galaxies, …).  Master toggle + per-category
 *      Advanced.
 *
 * Each master toggle reflects the OR-tristate of its per-axis sub-toggles;
 * the per-axis controls move into a default-closed Advanced disclosure so
 * the explorer surface stays scannable.  Power users open Advanced when
 * they want fine-grained control; the explorer never has to.
 *
 * ### What got evicted
 *
 * Per audit Q6 / Q12 / Q11 / Q16d: brightness, exposure, auto-rotate, the
 * galaxy-thumbnails toggle, and the Milky Way toggle are gone from the
 * panel.  Defaults handle the explorer case; the engine plumbing for each
 * remains intact (callable from the dev console or future re-introduction)
 * but no UI surface.  Auto-LOD (audit Q15 / PR #156) was dead code, removed
 * entirely.
 *
 * ### Tier as a header chip
 *
 * Tier moves from a full-width segmented row at the top of the body into
 * a compact `TierChip` dropdown in the panel header strip (slotted via
 * the new `Panel.headerExtra` prop).  The chip still surfaces the current
 * tier always-visible — the most consequential decision shouldn't be
 * hidden — but reclaims one panel-body row that the four thematic groups
 * benefit from.
 *
 * ### Cosmic web Style picker semantics
 *
 * The picker (Smooth / Filaments / Both) is a *high-level* shortcut that
 * batches mutations to the volumes master + filaments master toggles in
 * one click:
 *
 *   - **Smooth**     → volumes ON,  filaments OFF
 *   - **Filaments**  → volumes OFF, filaments ON
 *   - **Both**       → volumes ON,  filaments ON
 *
 * Per-source toggles inside Advanced (per-cube enable, per-cube intensity,
 * filament intensity) operate independently of the picker.  The picker
 * label is *derived* from the current master states — if a power user is
 * in "Smooth" and manually enables CF-4 via Advanced, the picker still
 * says "Smooth".  That's intentional: the picker is a UI shortcut, not a
 * separate state slot.  When neither master is on (Cosmic web group's own
 * master is OFF), the picker is hidden because there's nothing to style.
 *
 * ### Props-driven, no internal state
 *
 * App.tsx still owns every settings value; this component renders the
 * current values and emits callbacks.  Section open/closed state lives
 * inside CollapsibleSection (session-only).  See the wrapping App.tsx for
 * how each callback wires into the engine handle.
 *
 * ### Layout CSS
 *
 * Row/slider/dropdown styling lives in `SettingsPanel.module.css`; the
 * outer panel chrome (glass card, title strip with the Tier chip slot)
 * lives in the shared `Panel` / `Panel.module.css`.
 */

import { type ReactNode } from 'react';
import type { Tier } from '../../@types/data/Tier';
import { Source, SOURCE_REGISTRY } from '../../data/sources';
import { maskHas } from '../../utils/sourceMask';
import { BiasMode } from '../../data/biasMode';
import type { BiasMode as BiasModeT } from '../../@types/data/BiasMode';
import { ALL_TONE_MAP_CURVES, toneMapCurveLabel } from '../../data/toneMapCurve';
import type { ToneMapCurve as ToneMapCurveT } from '../../@types/data/ToneMapCurve';
import type { LabelCategory } from '../../@types/engine/data/LabelCategory';
import type { StructureCategory } from '../../@types/engine/data/StructureCategory';
import { CATEGORY_DISPLAY_INFO } from '../../data/categoryDisplayInfo';
import { LABEL_CATEGORIES } from '../../data/labelCategories';
import { STRUCTURE_CATEGORIES } from '../../data/structureCategories';
import type { ScalarFieldPaletteId } from '../../@types/data/ScalarFieldPaletteId';
import type { VolumeFieldRowData } from '../../@types/settings/VolumeFieldRowData';
import type { VolumeFieldId } from '../../@types/data/VolumeFieldId';
import type { FlowSettings } from '../../@types/settings/FlowSettings';
import { VolumeFieldRow } from './VolumeFieldRow';
import FlowRow from './FlowRow';
import { Panel } from '../common/Panel/Panel';
import Button from '../common/Button/Button';
import { CollapsibleSection } from './CollapsibleSection';
import { TierChip } from './TierChip';
import styles from './SettingsPanel.module.css';
import type { SourceType } from '../../@types/data/SourceType';

// ── Module-level constants ─────────────────────────────────────────────────────

/**
 * The set of survey sources we expose as user-controllable toggles.
 *
 * `Source.Synthetic` is intentionally omitted — the synthetic cloud is a
 * procedurally-generated fallback used while real survey data is loading.
 * Letting users toggle it would invite confusing "no real surveys +
 * synthetic off = empty sky" states with no clear way back.
 *
 * Ordered smallest-catalogue → largest (Famous ~20 → 2MRS ~38 k → SDSS
 * ~500 k → GLADE ~2 M) so the user sees the "iceberg tip" first and can
 * reason about what each toggle adds in size.
 */
const TOGGLEABLE_SOURCES: readonly SourceType[] = [
  Source.FamousGalaxy,
  Source.TwoMRS,
  Source.SDSS,
  Source.Glade,
  Source.Milliquas,
];

/**
 * High-level Style picker options for the Cosmic web group.  Derived from
 * (volumes master, filaments master) at render time — see the picker's
 * docblock inside the JSX below.
 */
type CosmicWebStyle = 'smooth' | 'filaments' | 'both';

// ── Props ──────────────────────────────────────────────────────────────────────

/**
 * Props for SettingsPanel.
 *
 * Several props are optional so older test fixtures and partial wirings
 * continue to typecheck.  Each conditional section gates on its full set
 * of props being present (value + callback) — same opt-in idiom every
 * section uses, prevents half-rendered UIs where a control exists but
 * can't echo state changes (or vice versa).
 */
type Props = {
  // ── Tier ───────────────────────────────────────────────────────────────
  /** Currently-active data tier.  Drives the TierChip in the panel header. */
  tier?: Tier;
  /** Called with the new tier when the user picks from the TierChip dropdown. */
  onTierChange?: (tier: Tier) => void;

  // ── Galaxies group ─────────────────────────────────────────────────────
  /** Bitmask of currently-visible sources.  See `data/sources.ts`. */
  visibleSourceMask?: number;
  /** Called when the user toggles a single survey on/off in Advanced. */
  onToggleSource?: (source: SourceType, visible: boolean) => void;
  /**
   * Per-source point counts indexed by Source enum value.  Surveys whose
   * .bin hasn't loaded yet are absent from the map — the row in the UI
   * then renders the toggle without a count rather than a misleading "0".
   */
  sourceCounts?: Partial<Record<SourceType, number>>;

  /**
   * Per-marker-category structure counts (cluster / supercluster / void) for
   * the Structures section, shown beside each toggle the same way
   * `sourceCounts` annotates the Surveys rows.  A category absent from
   * the map (or the whole prop undefined, before the bulk `.ccat`
   * lands) renders the toggle without a count rather than "0".
   */
  structureCounts?: Partial<Record<StructureCategory, number>>;

  /** Current point size in pixels.  Lives under Galaxies → Advanced. */
  pointSize: number;
  /** Called when the user changes the point-size slider. */
  onPointSizeChange: (v: number) => void;

  /** Whether the camera-distance depth fade is on (galaxy alpha attenuation). */
  depthFadeEnabled?: boolean;
  /** Called when the user toggles the Depth fade checkbox. */
  onDepthFadeEnabledChange?: (enabled: boolean) => void;

  /** Currently-selected density-correction (Malmquist bias) mode. */
  biasMode?: BiasModeT;
  /** Called when the user picks a different density-correction mode. */
  onBiasModeChange?: (mode: BiasModeT) => void;
  /** Faintest absolute magnitude kept under `BiasMode.VolumeLimited`. */
  absMagLimit?: number;
  /** Called when the user drags the M_lim slider. */
  onAbsMagLimitChange?: (absMag: number) => void;

  // ── Cosmic web group ───────────────────────────────────────────────────
  /** Whether the DisPerSE filament-skeleton overlay is rendered. */
  filamentsEnabled?: boolean;
  /** Fired when the picker / Advanced flips the Filaments master. */
  onFilamentsChange?: (enabled: boolean) => void;
  /** Filament-overlay intensity scale, [0, 1].  Shown in Advanced. */
  filamentIntensity?: number;
  onFilamentIntensityChange?: (value: number) => void;
  /** Master on/off for all registered scalar-volume fields. */
  volumesEnabled?: boolean;
  /** Fired when the picker / Advanced flips the Volumes master. */
  onVolumesEnabledChange?: (enabled: boolean) => void;
  /**
   * Snapshot of every registered field's UI state — one entry per cube.
   * Drives the per-cube rows inside Cosmic web → Advanced.
   */
  volumeFields?: ReadonlyArray<VolumeFieldRowData>;
  onVolumeFieldEnabledChange?: (id: VolumeFieldId, enabled: boolean) => void;
  onVolumeFieldIntensityChange?: (id: VolumeFieldId, intensity: number) => void;
  onVolumeFieldContrastChange?: (id: VolumeFieldId, contrast: number) => void;
  onVolumeFieldDensityScaleChange?: (id: VolumeFieldId, value: number) => void;
  onVolumeFieldTrimChange?: (id: VolumeFieldId, trim: number) => void;
  onVolumeFieldExposureChange?: (id: VolumeFieldId, exposure: number) => void;
  onVolumeFieldPaletteChange?: (id: VolumeFieldId, paletteId: ScalarFieldPaletteId) => void;

  // ── Flow group (CF4++ peculiar-velocity overlay) ───────────────────────
  /**
   * Flow-overlay state.  App-owned optimistic (no engine echo), like the
   * filaments props above — `onFlowChange` applies a `Partial<FlowSettings>`
   * to both the React mirror and `handle.flow.set`.  The header toggle reads
   * `flow.enabled`; FlowRow reads `mode` / `intensity`.  The group is gated on
   * both props being present (see `showFlowSection`), so older / partial call
   * sites render no Flow section.
   */
  flow?: FlowSettings;
  onFlowChange?: (patch: Partial<FlowSettings>) => void;

  // ── Structures group (cluster / supercluster / void MARKER rings) ──────
  /**
   * Per-category MARKER visibility — drives the per-category checkboxes
   * inside Structures → Advanced and the derived tri-state of the master
   * toggle.  Wires through `onSetMarkerCategoryVisibility`, which App routes
   * to `handle.structures.setItemEnabled`.
   */
  markerCategoryVisibility?: Readonly<Record<StructureCategory, boolean>>;
  onSetMarkerCategoryVisibility?: (category: StructureCategory, visible: boolean) => void;

  // ── Labels group (ALL text annotations) ────────────────────────────────
  /** Per-category LABEL visibility — independent of marker visibility. */
  labelCategoryVisibility: Readonly<Record<LabelCategory, boolean>>;
  onSetLabelCategoryVisibility: (category: LabelCategory, visible: boolean) => void;

  // ── Display group (power-user disclosure) ──────────────────────────────
  /** Currently-selected tone-mapping curve. */
  toneMapCurve?: ToneMapCurveT;
  onToneMapCurveChange?: (curve: ToneMapCurveT) => void;

  // ── SpaceMouse 6DOF input (conditional, WebHID-only) ───────────────────
  /** Feature gate — only render the SpaceMouse section when true. */
  spaceMouseSupported?: boolean;
  spaceMouseConnected?: boolean;
  onConnectSpaceMouse?: () => void;
  spaceMouseSensitivity?: number;
  onSpaceMouseSensitivityChange?: (value: number) => void;

  // ── Footer ─────────────────────────────────────────────────────────────
  /** Called when the user clicks Reset camera. */
  onResetCamera: () => void;

  /** Forwarded to Panel — App.tsx passes `false` on mobile viewports. */
  defaultOpen?: boolean;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Derive the current Cosmic web style from the two underlying master
 * toggles.  Returns `null` when neither is on — caller then hides the
 * picker (the group's own master being OFF means there's nothing to
 * style).
 */
function deriveCosmicWebStyle(volumesOn: boolean, filamentsOn: boolean): CosmicWebStyle | null {
  if (volumesOn && filamentsOn) return 'both';
  if (volumesOn) return 'smooth';
  if (filamentsOn) return 'filaments';
  return null;
}

// ── SettingsPanel ──────────────────────────────────────────────────────────────

/**
 * Glassmorphic settings panel fixed in the bottom-left HUD stack.
 *
 * Stateless re: settings values — everything flows down through props
 * and back up through callbacks.  Section open/closed state lives in
 * the nested `CollapsibleSection`s (session-only, no persistence).
 */
export function SettingsPanel({
  tier,
  onTierChange,
  visibleSourceMask,
  onToggleSource,
  sourceCounts,
  structureCounts,
  pointSize,
  onPointSizeChange,
  depthFadeEnabled,
  onDepthFadeEnabledChange,
  biasMode,
  onBiasModeChange,
  absMagLimit,
  onAbsMagLimitChange,
  filamentsEnabled,
  onFilamentsChange,
  filamentIntensity,
  onFilamentIntensityChange,
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
  flow,
  onFlowChange,
  markerCategoryVisibility,
  onSetMarkerCategoryVisibility,
  labelCategoryVisibility,
  onSetLabelCategoryVisibility,
  toneMapCurve,
  onToneMapCurveChange,
  spaceMouseSupported,
  spaceMouseConnected,
  onConnectSpaceMouse,
  spaceMouseSensitivity,
  onSpaceMouseSensitivityChange,
  onResetCamera,
  defaultOpen,
}: Props): ReactNode {
  // ── Per-section opt-in gates ─────────────────────────────────────────────
  // Each conditional section requires its full prop set; either-or wirings
  // would produce half-broken UIs (controls without echoes, or echoes
  // without controls).
  const showTierChip = tier !== undefined && onTierChange !== undefined;
  const showSurveyToggles = visibleSourceMask !== undefined && onToggleSource !== undefined;
  const showFilamentsToggle = filamentsEnabled !== undefined && onFilamentsChange !== undefined;
  const showFilamentIntensitySlider =
    showFilamentsToggle &&
    filamentsEnabled === true &&
    filamentIntensity !== undefined &&
    onFilamentIntensityChange !== undefined;
  const showVolumesSection =
    volumesEnabled !== undefined &&
    onVolumesEnabledChange !== undefined &&
    volumeFields !== undefined &&
    onVolumeFieldEnabledChange !== undefined &&
    onVolumeFieldIntensityChange !== undefined &&
    onVolumeFieldContrastChange !== undefined;
  const showBiasControls =
    biasMode !== undefined &&
    onBiasModeChange !== undefined &&
    absMagLimit !== undefined &&
    onAbsMagLimitChange !== undefined;
  const showToneCurveControls = toneMapCurve !== undefined && onToneMapCurveChange !== undefined;
  // Flow section needs the slice + its patch callback (same opt-in idiom as
  // the other conditional sections) before it can both render and echo.
  const showFlowSection = flow !== undefined && onFlowChange !== undefined;
  const showStructuresGroup =
    markerCategoryVisibility !== undefined && onSetMarkerCategoryVisibility !== undefined;

  // ── Galaxies master (derived tri-state over per-survey toggles) ─────────
  // Same shape the pre-restructure panel used (it was the Surveys section
  // master); the audit promoted that pattern to the explorer surface and
  // moved per-survey toggles into Advanced.
  const galaxiesMaster = showSurveyToggles
    ? (() => {
        const enabledCount = TOGGLEABLE_SOURCES.reduce<number>(
          (n, s) => (maskHas(visibleSourceMask, s) ? n + 1 : n),
          0,
        );
        const allOn = enabledCount === TOGGLEABLE_SOURCES.length;
        const noneOn = enabledCount === 0;
        return {
          allOn,
          indeterminate: !allOn && !noneOn,
          // Tri-state click behaviour (Windows Explorer / Finder / GitHub
          // file-tree convention): from "none" → set all on; from "all" or
          // "mixed" → clear everything.  Maps the tri-state cycle to a
          // single boolean target the engine consumes per source.
          onToggle: () => {
            const targetEnabled = noneOn;
            for (const s of TOGGLEABLE_SOURCES) {
              onToggleSource(s, targetEnabled);
            }
          },
        };
      })()
    : null;

  // ── Cosmic web master + Style picker derivation ─────────────────────────
  // Master is derived from (volumes OR filaments) — at least one of the two
  // is on means the group's "anything cosmic-web" is showing.  Per audit
  // Q9(β) the master + style picker replace the pre-audit panel's two
  // independent Volumes / Filaments master toggles.
  const cosmicWebVolumesOn = volumesEnabled ?? false;
  const cosmicWebFilamentsOn = filamentsEnabled ?? false;
  const cosmicWebMasterOn = cosmicWebVolumesOn || cosmicWebFilamentsOn;
  // Mixed state isn't surfaced — master is "any on" vs "all off"; the
  // Style picker handles the on-state granularity below.
  const cosmicWebCurrentStyle = deriveCosmicWebStyle(cosmicWebVolumesOn, cosmicWebFilamentsOn);

  /**
   * Master Cosmic-web toggle handler.  When turning OFF, batch-disable both
   * underlying masters.  When turning ON, restore to "Smooth" as a sensible
   * default (the audit's pick for the default first-impression style — less
   * visually noisy than Filaments).  Same rationale as the explorer never
   * needing to think about per-source: a single click should produce a
   * coherent picture.
   */
  const onCosmicWebMasterToggle = (enabled: boolean) => {
    if (!enabled) {
      onVolumesEnabledChange?.(false);
      onFilamentsChange?.(false);
      return;
    }
    // Restore to Smooth (volumes on, filaments off).  Don't disturb any
    // per-cube enable bits inside Advanced — those persist across master
    // flips by design (the user's prior tuning shouldn't evaporate).
    onVolumesEnabledChange?.(true);
    onFilamentsChange?.(false);
  };

  /**
   * Style picker handler — batches the master mutations per the mapping
   * documented in the module header.  Per-cube and per-filament
   * sub-toggles in Advanced are intentionally NOT touched; the picker is
   * a high-level shortcut, not a "reset cube state" button.
   */
  const onSetCosmicWebStyle = (style: CosmicWebStyle) => {
    switch (style) {
      case 'smooth':
        onVolumesEnabledChange?.(true);
        onFilamentsChange?.(false);
        break;
      case 'filaments':
        onVolumesEnabledChange?.(false);
        onFilamentsChange?.(true);
        break;
      case 'both':
        onVolumesEnabledChange?.(true);
        onFilamentsChange?.(true);
        break;
    }
  };

  // ── Structures master (over cluster / SC / void MARKER axis) ────────────
  const structuresMaster = showStructuresGroup
    ? (() => {
        const enabledCount = STRUCTURE_CATEGORIES.reduce<number>(
          (n, cat) => (markerCategoryVisibility[cat] ? n + 1 : n),
          0,
        );
        const allOn = enabledCount === STRUCTURE_CATEGORIES.length;
        const noneOn = enabledCount === 0;
        return {
          allOn,
          indeterminate: !allOn && !noneOn,
          onToggle: () => {
            const targetEnabled = noneOn;
            for (const cat of STRUCTURE_CATEGORIES) {
              onSetMarkerCategoryVisibility(cat, targetEnabled);
            }
          },
        };
      })()
    : null;

  // ── Labels master (over every LABEL_CATEGORIES entry) ───────────────────
  const labelsMaster = (() => {
    const enabledCount = LABEL_CATEGORIES.reduce<number>(
      (n, cat) => (labelCategoryVisibility[cat] ? n + 1 : n),
      0,
    );
    const allOn = enabledCount === LABEL_CATEGORIES.length;
    const noneOn = enabledCount === 0;
    return {
      allOn,
      indeterminate: !allOn && !noneOn,
      onToggle: () => {
        const targetEnabled = noneOn;
        for (const cat of LABEL_CATEGORIES) {
          onSetLabelCategoryVisibility(cat, targetEnabled);
        }
      },
    };
  })();

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <Panel
      title="Settings"
      ariaLabel="Renderer settings"
      defaultOpen={defaultOpen}
      headerExtra={
        // The Tier chip sits in the panel's title strip rather than as a
        // body row — see the module header for the audit rationale.  Only
        // rendered when the parent wires both `tier` and `onTierChange`;
        // older / test call sites without those props see no chip and the
        // header strip falls back to title-only.
        showTierChip ? <TierChip tier={tier} onTierChange={onTierChange} /> : undefined
      }
    >
      {/*
        ── Section structure ────────────────────────────────────────────
        Four thematic sections (Galaxies, Cosmic web, Structures, Labels)
        each with a master toggle on the header and an "Advanced"
        disclosure for power-user knobs.  Then Display (its own Advanced
        disclosure) and the conditional SpaceMouse section.  Reset camera
        sits outside any section as a footer action.

        Section ORDER mirrors the explorer's mental model from "things"
        (Galaxies) → "the stuff between things" (Cosmic web) → "named
        landmarks" (Structures) → "annotations" (Labels), then global
        Display, then optional Input, then the footer action.
      */}

      {/* ── Galaxies ──────────────────────────────────────────────────── */}
      {/*
        Master = tri-state over per-survey toggles.  Default-on (every
        survey on at first paint).  The Advanced disclosure holds the
        per-survey toggles AND the galaxy-only render tunables (point
        size, depth fade, density correction) — all of which are
        meaningless when the master is off, so co-locating them keeps
        the explorer surface tight.
      */}
      {galaxiesMaster && (
        <CollapsibleSection
          title="Galaxies"
          headerToggle={galaxiesMaster.allOn}
          headerToggleIndeterminate={galaxiesMaster.indeterminate}
          onHeaderToggleChange={galaxiesMaster.onToggle}
        >
          {/* Surveys — per-survey toggles get their own subsection that
              opens by default with the Galaxies group.  "Which catalog am
              I looking at" is the most common reason to drill into
              Galaxies, so it sits in front and is one fewer click away
              than the power-user knobs below. */}
          <CollapsibleSection title="Surveys" defaultOpen>
            {TOGGLEABLE_SOURCES.map((s) => {
              const count = sourceCounts?.[s];
              return (
                <div className={styles.panelRow} key={s}>
                  <label htmlFor={`toggle-source-${s}`}>
                    {SOURCE_REGISTRY[s].label}
                    {count !== undefined && (
                      <span className={styles.sourceCount}>{count.toLocaleString()}</span>
                    )}
                  </label>
                  <input
                    id={`toggle-source-${s}`}
                    type="checkbox"
                    // `!` here is safe: this row only renders when
                    // `galaxiesMaster` is truthy, which itself gates on
                    // `showSurveyToggles`.  TS can't trace the narrow
                    // through the IIFE-derived `galaxiesMaster` value, so
                    // assert what we already know.
                    checked={maskHas(visibleSourceMask!, s)}
                    onChange={(e) => onToggleSource!(s, e.target.checked)}
                  />
                </div>
              );
            })}
          </CollapsibleSection>

          <CollapsibleSection title="Advanced">
            {/* Point size — galaxy-only tunable, lives here per Q16b. */}
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

            {/* Depth fade — galaxy-only tunable, lives here per Q16c. */}
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

            {/* Density correction (Malmquist bias) — astronomer-jargon-heavy
                but flat (single dropdown + conditional slider) per Q16e.
                Future modes (1/V_max, Schechter) ship as disabled options
                so the layout doesn't shift when they land. */}
            {showBiasControls && (
              <>
                <div className={styles.panelRow}>
                  <label htmlFor="bias-mode">Density correction</label>
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
              </>
            )}
          </CollapsibleSection>
        </CollapsibleSection>
      )}

      {/* ── Cosmic web ──────────────────────────────────────────────────── */}
      {/*
        Master = volumes OR filaments.  When master flips on from off, we
        default to "Smooth" (per audit Q9(β) — less visually noisy).
        Style picker (Smooth / Filaments / Both) batches the underlying
        master mutations; the per-source toggles inside Advanced override
        the style choice WITHOUT changing the picker label — the picker
        is a UI shortcut, not a separate state slot.  See the module
        header for the picker semantics in full.
      */}
      {(showFilamentsToggle || showVolumesSection) && (
        <CollapsibleSection
          title="Cosmic web"
          headerToggle={cosmicWebMasterOn}
          onHeaderToggleChange={onCosmicWebMasterToggle}
        >
          {/*
            Style picker — only meaningful when the group's master is on.
            Three-button segmented control (parallel to how the old
            TierSelector worked); aria-pressed semantics rather than
            radio so screen readers announce a toggled state per option.
          */}
          {cosmicWebCurrentStyle !== null && (
            <div className={styles.stylePicker} role="group" aria-label="Cosmic web style">
              {(['smooth', 'filaments', 'both'] as const).map((style) => {
                const pressed = cosmicWebCurrentStyle === style;
                const label =
                  style === 'smooth' ? 'Smooth' : style === 'filaments' ? 'Filaments' : 'Both';
                return (
                  <button
                    key={style}
                    type="button"
                    aria-pressed={pressed}
                    className={pressed ? styles.stylePickerButtonActive : styles.stylePickerButton}
                    onClick={() => {
                      // No re-fire guard — picking the active style is a
                      // no-op anyway (the underlying masters wouldn't
                      // change), and a click is cheap relative to the
                      // tier switcher's full re-fetch.
                      onSetCosmicWebStyle(style);
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          <CollapsibleSection title="Advanced">
            {/* Filament intensity — sits at the top of Advanced because it
                pairs with the Style picker's "Filaments" / "Both" choices.
                Only shown when the underlying filament overlay is on
                (slider would have no visible effect otherwise). */}
            {showFilamentIntensitySlider && (
              <>
                <div className={styles.panelRow}>
                  <label htmlFor="filament-intensity">Filament intensity</label>
                  <span className={styles.panelValue}>{filamentIntensity.toFixed(2)}</span>
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
            )}

            {/* Per-cube knobs — one VolumeFieldRow per registered field.
                Same component as the pre-restructure Volumes section; only
                its location changed (now under Cosmic web → Advanced).
                Empty-state hint when no cubes are registered yet — same
                idiom the SpaceMouse section uses for its "not connected"
                line. */}
            {showVolumesSection &&
              (volumeFields.length === 0 ? (
                <div className={styles.panelMode}>No volume fields registered.</div>
              ) : (
                volumeFields.map((field) => (
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
                    onEnabledChange={onVolumeFieldEnabledChange}
                    onIntensityChange={onVolumeFieldIntensityChange}
                    onContrastChange={onVolumeFieldContrastChange}
                    onTrimChange={onVolumeFieldTrimChange}
                    onExposureChange={onVolumeFieldExposureChange}
                    onDensityScaleChange={onVolumeFieldDensityScaleChange}
                    onPaletteChange={onVolumeFieldPaletteChange}
                  />
                ))
              ))}
          </CollapsibleSection>
        </CollapsibleSection>
      )}

      {/* ── Flow ────────────────────────────────────────────────────────── */}
      {/*
        CF4++ peculiar-velocity overlay.  A sibling of Cosmic web (the
        diffuse-matter sections), placed right after it.  Its enable lives
        on the section header as `headerToggle` — exactly like the Galaxies
        / Cosmic web / Structures / Labels masters — so every section's
        on/off control sits on the same header line.  The body (FlowRow) is
        the look controls only (mode switch + intensity).  `!` assertions
        are safe: the whole block is gated on `showFlowSection`, which proves
        every prop is defined; TS can't trace that narrow.
      */}
      {showFlowSection && (
        <CollapsibleSection
          title="Flow"
          headerToggle={flow!.enabled}
          onHeaderToggleChange={(enabled) => onFlowChange!({ enabled })}
        >
          <FlowRow flow={flow!} onChange={onFlowChange!} />
        </CollapsibleSection>
      )}

      {/* ── Structures ──────────────────────────────────────────────────── */}
      {/*
        Master = tri-state over cluster / supercluster / void MARKER
        visibility.  Per-category checkboxes live in Advanced.  Per audit
        Q11, marker visibility is a separate axis from label visibility —
        flipping a structure marker off keeps its label visible (and vice
        versa via the Labels group below).  `famousGalaxy` is intentionally
        absent from the marker batch — famous galaxies don't have ring
        markers (their visualisation is the galaxy point + thumbnail).
      */}
      {structuresMaster && (
        <CollapsibleSection
          title="Structures"
          headerToggle={structuresMaster.allOn}
          headerToggleIndeterminate={structuresMaster.indeterminate}
          onHeaderToggleChange={structuresMaster.onToggle}
        >
          {/* Per-category marker checkboxes live directly in the section
              body — no Advanced wrapper, since there are no other knobs
              to hide behind one.  Same `!` rationale as the Surveys
              block: `structuresMaster` truthiness already guarantees
              both props are defined, TS can't trace that through the
              IIFE. */}
          {STRUCTURE_CATEGORIES.map((cat) => {
            const count = structureCounts?.[cat];
            return (
              <div className={styles.panelRow} key={`marker-${cat}`}>
                <label htmlFor={`toggle-marker-${cat}`}>
                  {CATEGORY_DISPLAY_INFO[cat].plural}
                  {count !== undefined && (
                    <span className={styles.sourceCount}>{count.toLocaleString()}</span>
                  )}
                </label>
                <input
                  id={`toggle-marker-${cat}`}
                  type="checkbox"
                  checked={markerCategoryVisibility![cat]}
                  onChange={(e) => onSetMarkerCategoryVisibility!(cat, e.target.checked)}
                />
              </div>
            );
          })}
        </CollapsibleSection>
      )}

      {/* ── Labels ──────────────────────────────────────────────────────── */}
      {/*
        Master = tri-state over all four label categories.  The Labels
        group is a sibling of Structures (and not nested inside it)
        because per audit Q11 labels are an independent axis from entity
        visibility.  Per-category checkboxes (including the "you are here"
        label, expressed via the famousGalaxy category for the Milky Way
        pseudo-entry) live in Advanced.
      */}
      <CollapsibleSection
        title="Labels"
        headerToggle={labelsMaster.allOn}
        headerToggleIndeterminate={labelsMaster.indeterminate}
        onHeaderToggleChange={labelsMaster.onToggle}
      >
        {/* Per-category label checkboxes inline — same flattening as the
            Structures section above (nothing else lives here, so an
            Advanced wrapper would add a click without hiding anything
            useful). */}
        {LABEL_CATEGORIES.map((cat) => (
          <div className={styles.panelRow} key={`label-${cat}`}>
            <label htmlFor={`toggle-label-${cat}`}>{CATEGORY_DISPLAY_INFO[cat].plural}</label>
            <input
              id={`toggle-label-${cat}`}
              type="checkbox"
              checked={labelCategoryVisibility[cat]}
              onChange={(e) => onSetLabelCategoryVisibility(cat, e.target.checked)}
            />
          </div>
        ))}
      </CollapsibleSection>

      {/* ── Display (power-user disclosure, default closed) ─────────────── */}
      {/*
        Per audit Q14 + Q16a: with brightness / exposure / auto-rotate
        evicted, Display reduces to just the tone-curve dropdown.  The
        section IS its own Advanced disclosure (no master toggle, default
        closed) — explorer never sees the tone-curve jargon, tweaker
        opens one disclosure to find it.
      */}
      {showToneCurveControls && (
        <CollapsibleSection title="Display">
          <div className={styles.panelRow}>
            <label htmlFor="tonemap-curve">Tone curve</label>
            <select
              id="tonemap-curve"
              className={styles.modeSelect}
              value={toneMapCurve}
              onChange={(e) => onToneMapCurveChange(parseInt(e.target.value, 10) as ToneMapCurveT)}
            >
              {ALL_TONE_MAP_CURVES.map((c) => (
                <option key={c} value={c}>
                  {toneMapCurveLabel(c)}
                </option>
              ))}
            </select>
          </div>
        </CollapsibleSection>
      )}

      {/* ── SpaceMouse (auto-detected, conditional) ─────────────────────── */}
      {/*
        Visible only when the parent's WebHID feature-detect + device-
        presence check both pass (App.tsx composes the predicate; see
        `spaceMouseSectionVisible`).  Per audit Q16f: invisible to the
        ~99 % of users without a 3Dconnexion device, automatically
        present for the 1 % who plug one in.
      */}
      {spaceMouseSupported && (
        <CollapsibleSection title="SpaceMouse">
          <div className={styles.panelMode}>
            {spaceMouseConnected ? 'connected' : 'not connected'}
          </div>
          {!spaceMouseConnected && onConnectSpaceMouse && (
            <div className={styles.panelRow}>
              <Button className={styles.resetButton} onClick={onConnectSpaceMouse}>
                Connect SpaceMouse
              </Button>
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

      {/* ── Footer: Reset camera ────────────────────────────────────────── */}
      {/*
        Reset camera lives outside any section because it's an action,
        not a setting — folding it behind a disclosure would hide the
        panel's primary "I'm lost, take me home" affordance.
      */}
      <div className={styles.panelDivider} role="separator" />
      <Button className={styles.resetButton} onClick={onResetCamera}>
        Reset camera
      </Button>
    </Panel>
  );
}

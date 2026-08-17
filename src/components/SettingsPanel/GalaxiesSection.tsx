// src/components/SettingsPanel/GalaxiesSection.tsx
/**
 * GalaxiesSection — presentational component for the Galaxies thematic group
 * inside the SettingsPanel.
 *
 * Owns the Galaxies thematic group UI: per-catalog toggles, the tri-state
 * master, the point-size slider, depth-fade toggle, and density-correction
 * controls. Isolating this into its own component ensures a slider drag
 * re-renders ONLY this section rather than the entire HUD. The section owns the
 * tri-state master derivation (the `galaxiesMaster` object) — that logic is
 * section-local, summarising the per-catalog toggles that live right here, so
 * it belongs here, not in a shared parent.
 *
 * Imports nothing from `store/` or `state/`: this is a pure function of props
 * and transient CollapsibleSection open/closed state. Tests supply plain props
 * with no Provider.
 *
 * Why `memo`: when `GalaxiesSectionContainer`'s parent (SettingsPanel shell or
 * App) re-renders for an unrelated reason, `memo` bails on the prop-compare step
 * so the section does not re-render. The `useCallback`-wrapped handlers the
 * container passes in have stable identity across the container's lifetime
 * (dispatch is invariant), making the bail effective.
 */

import { memo } from 'react';
import { Source, SOURCE_REGISTRY } from '../../data/sources';
import { maskHas } from '../../utils/maskHas';
import { BiasMode } from '../../data/galaxyCatalog/biasMode';
import type { BiasMode as BiasModeT } from '../../@types/data/galaxyCatalog/BiasMode';
import type { SourceType } from '../../@types/data/SourceType';
import CollapsibleSection from './CollapsibleSection';
import Slider from '../common/Slider/Slider';
import styles from './SettingsPanel.module.css';

// ── Module-level constants ─────────────────────────────────────────────────────

/**
 * Galaxy catalog sources the user can toggle. Synthetic is omitted — it is a
 * fallback rendered while real catalogs load; toggling it invites confusing
 * "empty sky" states with no clear recovery. All-sky catalogs are ordered
 * smallest → largest so the user sees the "iceberg tip" first; the DESI deep
 * pencil-beam, dec-band wedge, and Sloan Great Wall sit last as
 * footprint-limited appendices to that ladder.
 */
const TOGGLEABLE_SOURCES: readonly SourceType[] = [
  Source.FamousGalaxy,
  Source.TwoMRS,
  Source.SDSS,
  Source.Glade,
  Source.Milliquas,
  Source.DesiDeep,
  Source.DesiWedge,
  Source.DesiSgw,
];

// ── Props ──────────────────────────────────────────────────────────────────────

type GalaxiesSectionProps = {
  /** Bitmask of currently-visible galaxy catalog sources. */
  visibleSourceMask: number;
  /** Called when the user toggles a single catalog on or off. */
  onToggleSource: (source: SourceType, visible: boolean) => void;
  /**
   * Per-source loaded point counts. Absent entries (catalog not yet loaded)
   * render the toggle without a count rather than a misleading "0".
   */
  sourceCounts?: Partial<Record<SourceType, number>>;
  /** Current point size in pixels. */
  pointSize: number;
  /** Called when the user moves the point-size slider. */
  onPointSizeChange: (v: number) => void;
  /** Whether camera-distance depth fade (alpha attenuation) is on. */
  depthFadeEnabled: boolean;
  /** Called when the user toggles depth fade. */
  onDepthFadeEnabledChange: (enabled: boolean) => void;
  /** Currently-selected Malmquist density-correction mode. */
  biasMode: BiasModeT;
  /** Called when the user picks a different density-correction mode. */
  onBiasModeChange: (mode: BiasModeT) => void;
  /** Faintest absolute magnitude kept under `BiasMode.VolumeLimited`. */
  absMagLimit: number;
  /** Called when the user moves the M_lim slider. */
  onAbsMagLimitChange: (absMag: number) => void;
  /** Overall physical-SB → HDR gain — the "Galaxy brightness" knob. */
  sbScale: number;
  /** Called when the user moves the galaxy-brightness slider. */
  onSbScaleChange: (v: number) => void;
  /** Bloom ceiling — the max surface-brightness amplitude a compact galaxy can emit. */
  sbMax: number;
  /** Called when the user moves the bloom-ceiling slider. */
  onSbMaxChange: (v: number) => void;
  /** Readability-falloff exponent — the "Distance falloff" knob. */
  falloffStrength: number;
  /** Called when the user moves the distance-falloff slider. */
  onFalloffStrengthChange: (v: number) => void;
};

// ── GalaxiesSection ────────────────────────────────────────────────────────────

/**
 * Renders the full Galaxies thematic group: a master tri-state toggle on the
 * section header, a default-open "Galaxy catalogs" sub-section with per-catalog
 * checkboxes, and a default-closed "Advanced" sub-section with the point-size
 * slider, depth-fade toggle, and density-correction controls.
 */
function GalaxiesSection({
  visibleSourceMask,
  onToggleSource,
  sourceCounts,
  pointSize,
  onPointSizeChange,
  depthFadeEnabled,
  onDepthFadeEnabledChange,
  biasMode,
  onBiasModeChange,
  absMagLimit,
  onAbsMagLimitChange,
  sbScale,
  onSbScaleChange,
  sbMax,
  onSbMaxChange,
  falloffStrength,
  onFalloffStrengthChange,
}: GalaxiesSectionProps) {
  // ── Master tri-state derivation ──────────────────────────────────────────────
  // Tri-state master = how many TOGGLEABLE_SOURCES are currently enabled.
  // Tri-state click convention (Windows Explorer / Finder / GitHub file-tree):
  //   "none" → set all on; "all" or "mixed" → clear everything.
  const enabledCount = TOGGLEABLE_SOURCES.reduce<number>(
    (n, s) => (maskHas(visibleSourceMask, s) ? n + 1 : n),
    0,
  );
  const allOn = enabledCount === TOGGLEABLE_SOURCES.length;
  const noneOn = enabledCount === 0;
  const galaxiesMaster = {
    allOn,
    indeterminate: !allOn && !noneOn,
    onToggle: () => {
      const targetEnabled = noneOn;
      for (const s of TOGGLEABLE_SOURCES) {
        onToggleSource(s, targetEnabled);
      }
    },
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <CollapsibleSection
      title="Galaxies"
      headerToggle={galaxiesMaster.allOn}
      headerToggleIndeterminate={galaxiesMaster.indeterminate}
      onHeaderToggleChange={galaxiesMaster.onToggle}
    >
      {/* Galaxy catalogs — per-catalog toggles in a default-open sub-section.
          "Which catalog am I looking at" is the most common reason to drill into
          Galaxies, so it sits in front and is one fewer click away than the
          power-user knobs below. */}
      <CollapsibleSection title="Galaxy catalogs" defaultOpen>
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
                className={styles.toggle}
                checked={maskHas(visibleSourceMask, s)}
                onChange={(e) => onToggleSource(s, e.target.checked)}
              />
            </div>
          );
        })}
      </CollapsibleSection>

      <CollapsibleSection title="Advanced">
        {/* Point size — galaxy-only tunable.  First in-panel trial of the
            compact Slider (label + value folded into one pill) in place of the
            house label-row + range-row + value-span triple. */}
        <div className={styles.panelRow}>
          <Slider
            label="Point size"
            value={pointSize}
            min={1.0}
            max={8.0}
            step={0.1}
            onChange={onPointSizeChange}
            format={(v) => `${v.toFixed(1)} px`}
          />
        </div>

        {/* Galaxy surface-brightness calibration knobs — overall HDR gain,
            bloom ceiling, and the resolved-fraction readability falloff. */}
        <div className={styles.panelRow}>
          <Slider
            label="Galaxy brightness"
            value={sbScale}
            min={0.5}
            max={30}
            step={0.5}
            onChange={onSbScaleChange}
            format={(v) => `${v.toFixed(1)}×`}
          />
        </div>

        <div className={styles.panelRow}>
          <Slider
            label="Bloom ceiling"
            value={sbMax}
            min={1}
            max={100}
            step={1}
            onChange={onSbMaxChange}
            format={(v) => v.toFixed(0)}
          />
        </div>

        <div className={styles.panelRow}>
          <Slider
            label="Distance falloff"
            value={falloffStrength}
            min={0}
            max={2}
            step={0.05}
            onChange={onFalloffStrengthChange}
            format={(v) => v.toFixed(2)}
          />
        </div>

        {/* Depth fade — galaxy-only tunable. */}
        <div className={styles.panelRow}>
          <label htmlFor="toggle-depth-fade">Depth fade</label>
          <input
            id="toggle-depth-fade"
            type="checkbox"
            className={styles.toggle}
            checked={depthFadeEnabled}
            onChange={(e) => onDepthFadeEnabledChange(e.target.checked)}
          />
        </div>

        {/* Density correction (Malmquist bias) — dropdown + conditional M_lim
            slider. Future modes ship as disabled options so the layout stays
            stable when they land. */}
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
          <div className={styles.panelRow}>
            <Slider
              label="M_lim"
              value={absMagLimit}
              min={-24}
              max={-15}
              step={0.1}
              onChange={onAbsMagLimitChange}
              format={(v) => v.toFixed(1)}
            />
          </div>
        )}
      </CollapsibleSection>
    </CollapsibleSection>
  );
}

export default memo(GalaxiesSection);

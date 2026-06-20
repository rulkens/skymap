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
import { CollapsibleSection } from './CollapsibleSection';
import styles from './SettingsPanel.module.css';

// ── Module-level constants ─────────────────────────────────────────────────────

/**
 * Galaxy catalog sources the user can toggle. Synthetic is omitted — it is a
 * fallback rendered while real catalogs load; toggling it invites confusing
 * "empty sky" states with no clear recovery. Ordered smallest → largest so the
 * user sees the "iceberg tip" first.
 */
const TOGGLEABLE_SOURCES: readonly SourceType[] = [
  Source.FamousGalaxy,
  Source.TwoMRS,
  Source.SDSS,
  Source.Glade,
  Source.Milliquas,
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
                checked={maskHas(visibleSourceMask, s)}
                onChange={(e) => onToggleSource(s, e.target.checked)}
              />
            </div>
          );
        })}
      </CollapsibleSection>

      <CollapsibleSection title="Advanced">
        {/* Point size — galaxy-only tunable. */}
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

        {/* Depth fade — galaxy-only tunable. */}
        <div className={styles.panelRow}>
          <label htmlFor="toggle-depth-fade">Depth fade</label>
          <input
            id="toggle-depth-fade"
            type="checkbox"
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
    </CollapsibleSection>
  );
}

export default memo(GalaxiesSection);

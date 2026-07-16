// src/components/SettingsPanel/StarsSection.tsx
/**
 * StarsSection — presentational component for the star-catalogs thematic group
 * inside the SettingsPanel.
 *
 * Owns the star-catalogs group UI: a master gate toggle on the section header
 * and per-catalog visibility checkboxes (just `gaiaStars` today; the
 * `STAR_CATALOG_IDS.map(...)` row loop is the extension point for a future
 * second catalog), plus a default-closed "Advanced" sub-section carrying the
 * shared star-size and star-brightness sliders — the star-catalog twins of the
 * Galaxies section's point-size and brightness controls — plus two lattice
 * controls unique to the octree-cut star renderer: "Detail" (the CPU refine
 * threshold) and "Glow overlap" (the aggregate glow spread). It renders NO
 * per-catalog label toggle — mirroring the
 * Galaxies section, star-label visibility lives in the separate Labels section.
 *
 * ### Master: a real gate, not a per-source fan-out
 *
 * Unlike `GalaxiesSection`/`StructuresSection` — whose masters derive purely
 * from the per-item flags and fan a click out to every row — the star-catalogs
 * cluster owns a real `enabled` gate (`starCatalogs.enabled`, Task 5). So the
 * master checkbox reflects that gate directly and flips it on click. The
 * `indeterminate` visual is still derived from the per-item flags: gate-on while
 * some-but-not-all catalogs are individually enabled reads as "mixed", the same
 * affordance the sibling sections show. Deriving it here keeps the summary
 * section-local rather than storing a redundant tri-state field.
 *
 * Imports nothing from `store/` or `state/`: a pure function of props and the
 * transient CollapsibleSection open/closed state. Tests supply plain props with
 * no Provider.
 *
 * Why `memo`: when `StarsSectionContainer`'s parent re-renders for an unrelated
 * reason, `memo` bails on the prop-compare step. The `useCallback`-wrapped
 * handlers the container passes have stable identity (dispatch is invariant),
 * making the bail effective.
 */

import { memo } from 'react';
import { STAR_CATALOG_IDS } from '../../data/starCatalog/starCatalogIds';
import { SOURCE_ENTRIES } from '../../data/sourceEntries';
import { CollapsibleSection } from './CollapsibleSection';
import styles from './SettingsPanel.module.css';
import type { StarCatalogId } from '../../@types/data/starCatalog/StarCatalogId';
import type { StarCatalogItemSettings } from '../../@types/settings/StarCatalogItemSettings';

// ── Props ──────────────────────────────────────────────────────────────────────

type StarsSectionProps = {
  /** Master gate: whether the star-catalogs layer is shown at all. */
  enabled: boolean;
  /** Per-catalog visibility (+ inert `labelEnabled`), keyed by star catalog id. */
  items: Record<StarCatalogId, StarCatalogItemSettings>;
  /** Current star-billboard size in pixels (shared across every star catalog). */
  sizePx: number;
  /** Current star-brightness trim (shared; 1.0 = identity). */
  brightness: number;
  /** Current octree-cut refine threshold — the "Detail" knob (lower = more detail). */
  refineThreshold: number;
  /** Current aggregate glow-overlap spread (shared; 1.0 = identity). */
  glowOverlap: number;
  /** Current near-anchor display exposure — the "Exposure (near)" tuning knob. */
  exposureNearX: number;
  /** Current far-anchor display exposure — the "Exposure (far)" tuning knob. */
  exposureFarX: number;
  /** Called when the user toggles the master gate on or off. */
  onToggleMaster: (enabled: boolean) => void;
  /** Called when the user toggles a single star catalog on or off. */
  onToggleCatalog: (id: StarCatalogId, enabled: boolean) => void;
  /** Called when the user moves the star-size slider. */
  onSizeChange: (v: number) => void;
  /** Called when the user moves the star-brightness slider. */
  onBrightnessChange: (v: number) => void;
  /** Called when the user moves the Detail (refine-threshold) slider. */
  onRefineThresholdChange: (v: number) => void;
  /** Called when the user moves the glow-overlap slider. */
  onGlowOverlapChange: (v: number) => void;
  /** Called when the user moves the Exposure (near) slider. */
  onExposureNearXChange: (v: number) => void;
  /** Called when the user moves the Exposure (far) slider. */
  onExposureFarXChange: (v: number) => void;
};

// ── StarsSection ─────────────────────────────────────────────────────────────

/**
 * Renders the star-catalogs group: a master gate toggle on the section header
 * and a default-open "Star catalogs" sub-section of per-catalog checkboxes.
 */
function StarsSection({
  enabled,
  items,
  sizePx,
  brightness,
  refineThreshold,
  glowOverlap,
  exposureNearX,
  exposureFarX,
  onToggleMaster,
  onToggleCatalog,
  onSizeChange,
  onBrightnessChange,
  onRefineThresholdChange,
  onGlowOverlapChange,
  onExposureNearXChange,
  onExposureFarXChange,
}: StarsSectionProps) {
  // Tri-state master: `checked` follows the real gate; `indeterminate` flags
  // "gate on, but not every catalog is individually enabled" (mixed).
  const allEnabled = STAR_CATALOG_IDS.every((id) => items[id].enabled);
  const indeterminate = enabled && !allEnabled;

  return (
    <CollapsibleSection
      title="Stars"
      headerToggle={enabled}
      headerToggleIndeterminate={indeterminate}
      onHeaderToggleChange={onToggleMaster}
    >
      <CollapsibleSection title="Star catalogs" defaultOpen>
        {STAR_CATALOG_IDS.map((id) => {
          const label = SOURCE_ENTRIES.find((e) => e.id === id)?.label ?? id;
          return (
            <div className={styles.panelRow} key={id}>
              <label htmlFor={`toggle-star-catalog-${id}`}>{label}</label>
              <input
                id={`toggle-star-catalog-${id}`}
                type="checkbox"
                checked={items[id].enabled}
                onChange={(e) => onToggleCatalog(id, e.target.checked)}
              />
            </div>
          );
        })}
      </CollapsibleSection>

      <CollapsibleSection title="Advanced">
        {/* Star size — shared star-billboard knob, twin of the Galaxies
            section's point-size slider (same 1–8 px range). */}
        <div className={styles.panelRow}>
          <label htmlFor="slider-star-size">Star size</label>
          <span className={styles.panelValue}>{sizePx.toFixed(1)} px</span>
        </div>
        <div className={styles.panelRow}>
          <input
            id="slider-star-size"
            type="range"
            min={1.0}
            max={8.0}
            step={0.1}
            value={sizePx}
            onChange={(e) => onSizeChange(parseFloat(e.target.value))}
          />
        </div>

        {/* Star brightness — shared exposure trim, twin of the Galaxies
            brightness control (0.01–4 range). 1.0 is identity: the
            flux-glow shader's calibrated STAR_FLUX_EXPOSURE baseline unchanged.
            A scale-dependent exposure ramp handles the big cross-scale swing,
            so this stays a trim rather than a wide-range knob. */}
        <div className={styles.panelRow}>
          <label htmlFor="slider-star-brightness">Star brightness</label>
          <span className={styles.panelValue}>{brightness.toFixed(1)}×</span>
        </div>
        <div className={styles.panelRow}>
          <input
            id="slider-star-brightness"
            type="range"
            min={0.01}
            max={4}
            step={0.05}
            value={brightness}
            onChange={(e) => onBrightnessChange(parseFloat(e.target.value))}
          />
        </div>

        {/* Detail — the CPU octree-cut refine threshold. LOWER = far boxes split
            earlier = fewer visible lattice cells (more detail), at the cost of
            more drawn nodes. Range 0.01–0.30; NOT a GPU uniform. */}
        <div className={styles.panelRow}>
          <label htmlFor="slider-star-detail">Detail</label>
          <span className={styles.panelValue}>{refineThreshold.toFixed(2)}</span>
        </div>
        <div className={styles.panelRow}>
          <input
            id="slider-star-detail"
            type="range"
            min={0.01}
            max={0.3}
            step={0.01}
            value={refineThreshold}
            onChange={(e) => onRefineThresholdChange(parseFloat(e.target.value))}
          />
        </div>

        {/* Glow overlap — spreads far aggregate glows past their octree-box
            footprint so the box lattice dissolves. 1.0 = identity (flux-
            conserving; the shader divides the peak by the square). Range 1.0–6.0. */}
        <div className={styles.panelRow}>
          <label htmlFor="slider-star-glow-overlap">Glow overlap</label>
          <span className={styles.panelValue}>{glowOverlap.toFixed(1)}×</span>
        </div>
        <div className={styles.panelRow}>
          <input
            id="slider-star-glow-overlap"
            type="range"
            min={1.0}
            max={6.0}
            step={0.1}
            value={glowOverlap}
            onChange={(e) => onGlowOverlapChange(parseFloat(e.target.value))}
          />
        </div>

        {/* Exposure (near) — the absolute display exposure the scale-dependent
            starExposureRamp targets at its near (solar-system) anchor. A live
            tuning knob; the value gets frozen once re-eye-tuned. Range 1–60. */}
        <div className={styles.panelRow}>
          <label htmlFor="slider-star-exposure-near">Exposure (near)</label>
          <span className={styles.panelValue}>{exposureNearX.toFixed(1)}×</span>
        </div>
        <div className={styles.panelRow}>
          <input
            id="slider-star-exposure-near"
            type="range"
            min={1}
            max={60}
            step={0.5}
            value={exposureNearX}
            onChange={(e) => onExposureNearXChange(parseFloat(e.target.value))}
          />
        </div>

        {/* Exposure (far) — the absolute display exposure the ramp targets at its
            far (whole-galaxy) anchor, where the field reads as diffuse surface
            brightness. Live tuning knob; range 5–300. */}
        <div className={styles.panelRow}>
          <label htmlFor="slider-star-exposure-far">Exposure (far)</label>
          <span className={styles.panelValue}>{exposureFarX.toFixed(0)}×</span>
        </div>
        <div className={styles.panelRow}>
          <input
            id="slider-star-exposure-far"
            type="range"
            min={5}
            max={300}
            step={1}
            value={exposureFarX}
            onChange={(e) => onExposureFarXChange(parseFloat(e.target.value))}
          />
        </div>
      </CollapsibleSection>
    </CollapsibleSection>
  );
}

export default memo(StarsSection);

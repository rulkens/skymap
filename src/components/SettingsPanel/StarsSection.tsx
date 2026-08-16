// src/components/SettingsPanel/StarsSection.tsx
/**
 * StarsSection — presentational component for the star-catalogs thematic group
 * inside the SettingsPanel.
 *
 * Owns the star-catalogs group UI: a master gate toggle on the section header
 * and per-catalog visibility checkboxes, one per `STAR_CATALOG_IDS` entry (the
 * curated famous-star map and the survey-wide Gaia bin), plus a default-closed
 * "Advanced" sub-section carrying the shared star-size and star-brightness
 * sliders — the star-catalog twins of the Galaxies section's point-size and
 * brightness controls — plus two lattice controls unique to the octree-cut star
 * renderer: "Detail" (the CPU refine threshold) and "Glow overlap" (the
 * aggregate glow spread). It renders NO per-catalog label toggle — mirroring the
 * Galaxies section, star-label visibility lives in the separate Labels section.
 *
 * ### Master: a real gate, not a per-source fan-out
 *
 * Unlike `GalaxiesSection`/`StructuresSection` — whose masters derive purely
 * from the per-item flags and fan a click out to every row — the star-catalogs
 * cluster owns a real `enabled` gate (`starCatalogs.enabled`). So the
 * master checkbox reflects that gate directly and flips it on click. The
 * `indeterminate` visual is still derived from the per-item flags: gate-on while
 * some-but-not-all catalogs are individually enabled reads as "mixed", the same
 * affordance the sibling sections show. Deriving it here keeps the summary
 * section-local rather than storing a redundant tri-state field.
 *
 * The tri-state is derived over EVERY star-catalog id, which is only honest
 * because the gate is total: engine-side, every consumer of a star catalog's
 * visibility requires the master before the row's own bit, so the header
 * checkbox really can hide each row it summarises. Turning it off leaves the
 * Sun drawn: the descent's aim point is its own `bodies` row, so it was never
 * in the set this gate governs.
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
import CollapsibleSection from './CollapsibleSection';
import Slider from '../common/Slider/Slider';
import styles from './SettingsPanel.module.css';
import type { StarCatalogId } from '../../@types/data/starCatalog/StarCatalogId';
import type { StarCatalogItemSettings } from '../../@types/settings/StarCatalogItemSettings';
import type { SourceEntryBase } from '../../@types/data/SourceEntryBase';

// ── Props ──────────────────────────────────────────────────────────────────────

type StarsSectionProps = {
  /** Master gate: whether the star-catalogs layer is shown at all. */
  enabled: boolean;
  /** Per-catalog visibility (+ inert `labelEnabled`), keyed by star catalog id. */
  items: Record<StarCatalogId, StarCatalogItemSettings>;
  /**
   * Per-catalog loaded star counts, keyed by star catalog id. Absent entries
   * (catalog not yet loaded) render the row without a count rather than a
   * misleading "0" — the same contract the Galaxies section's count chip keeps.
   */
  counts?: Partial<Record<StarCatalogId, number>>;
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
  /** Current middle-anchor display exposure — the "Exposure (mid)" tuning knob. */
  exposureMidX: number;
  /** Current far-anchor display exposure — the "Exposure (far)" tuning knob. */
  exposureFarX: number;
  /** Current aggregate surface-brightness cap — the "Fog cap" tuning knob. */
  aggregateIntensityCap: number;
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
  /** Called when the user moves the Exposure (mid) slider. */
  onExposureMidXChange: (v: number) => void;
  /** Called when the user moves the Exposure (far) slider. */
  onExposureFarXChange: (v: number) => void;
  /** Called when the user moves the Fog cap slider. */
  onAggregateIntensityCapChange: (v: number) => void;
};

// ── StarsSection ─────────────────────────────────────────────────────────────

/**
 * Renders the star-catalogs group: a master gate toggle on the section header
 * and a default-open "Star catalogs" sub-section of per-catalog checkboxes.
 */
function StarsSection({
  enabled,
  items,
  counts,
  sizePx,
  brightness,
  refineThreshold,
  glowOverlap,
  exposureNearX,
  exposureMidX,
  exposureFarX,
  aggregateIntensityCap,
  onToggleMaster,
  onToggleCatalog,
  onSizeChange,
  onBrightnessChange,
  onRefineThresholdChange,
  onGlowOverlapChange,
  onExposureNearXChange,
  onExposureMidXChange,
  onExposureFarXChange,
  onAggregateIntensityCapChange,
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
          // `plural` (not the singular `label`, which stays reserved for the
          // InfoCard source badge) — this row is a toggle-header list entry,
          // the same field the Labels section reads for its rows. Cast to the
          // shared base: `plural` is optional there, but individual registry
          // literals omit the key entirely when absent (bearsLabel: false),
          // which TS won't structurally unify across the SOURCE_ENTRIES union.
          const entry = SOURCE_ENTRIES.find((e) => e.id === id) as SourceEntryBase | undefined;
          const label = entry?.plural ?? entry?.label ?? id;
          const count = counts?.[id];
          return (
            <div className={styles.panelRow} key={id}>
              <label htmlFor={`toggle-star-catalog-${id}`}>
                {label}
                {count !== undefined && (
                  <span className={styles.sourceCount}>{count.toLocaleString()}</span>
                )}
              </label>
              <input
                id={`toggle-star-catalog-${id}`}
                type="checkbox"
                className={styles.toggle}
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
          <Slider
            label="Star size"
            value={sizePx}
            min={1.0}
            max={8.0}
            step={0.1}
            onChange={onSizeChange}
            format={(v) => `${v.toFixed(1)} px`}
          />
        </div>

        {/* Star brightness — shared exposure trim, twin of the Galaxies
            brightness control (0.01–4 range). 1.0 is identity: the
            flux-glow shader's calibrated STAR_FLUX_EXPOSURE baseline unchanged.
            A scale-dependent exposure ramp handles the big cross-scale swing,
            so this stays a trim rather than a wide-range knob. */}
        <div className={styles.panelRow}>
          <Slider
            label="Star brightness"
            value={brightness}
            min={0.01}
            max={4}
            step={0.05}
            onChange={onBrightnessChange}
            format={(v) => `${v.toFixed(1)}×`}
          />
        </div>

        {/* Detail — the CPU octree-cut refine threshold. LOWER = far boxes split
            earlier = fewer visible lattice cells (more detail), at the cost of
            more drawn nodes. Range 0.01–0.30; NOT a GPU uniform. */}
        <div className={styles.panelRow}>
          <Slider
            label="Detail"
            value={refineThreshold}
            min={0.01}
            max={0.3}
            step={0.01}
            onChange={onRefineThresholdChange}
            format={(v) => v.toFixed(2)}
          />
        </div>

        {/* Glow overlap — spreads far aggregate glows past their octree-box
            footprint so the box lattice dissolves. 1.0 = identity (flux-
            conserving; the shader divides the peak by the square). Range 1.0–6.0. */}
        <div className={styles.panelRow}>
          <Slider
            label="Glow overlap"
            value={glowOverlap}
            min={1.0}
            max={6.0}
            step={0.1}
            onChange={onGlowOverlapChange}
            format={(v) => `${v.toFixed(1)}×`}
          />
        </div>

        {/* Exposure (near) — the absolute display exposure the scale-dependent
            starExposureRamp targets at its near (solar-system) anchor. A live
            tuning knob; the value gets frozen once re-eye-tuned. Range 1–60. */}
        <div className={styles.panelRow}>
          <Slider
            label="Exposure (near)"
            value={exposureNearX}
            min={1}
            max={60}
            step={0.5}
            onChange={onExposureNearXChange}
            format={(v) => `${v.toFixed(1)}×`}
          />
        </div>

        {/* Exposure (mid) — the absolute display exposure the ramp targets at its
            middle (few-kpc) anchor. Pull it down to darken the over-exposed
            central clump without touching either end. Range 5–150. */}
        <div className={styles.panelRow}>
          <Slider
            label="Exposure (mid)"
            value={exposureMidX}
            min={5}
            max={150}
            step={1}
            onChange={onExposureMidXChange}
            format={(v) => `${v.toFixed(0)}×`}
          />
        </div>

        {/* Exposure (far) — the absolute display exposure the ramp targets at its
            far (whole-galaxy) anchor, where the field reads as diffuse surface
            brightness. Live tuning knob; range 5–300. */}
        <div className={styles.panelRow}>
          <Slider
            label="Exposure (far)"
            value={exposureFarX}
            min={5}
            max={300}
            step={1}
            onChange={onExposureFarXChange}
            format={(v) => `${v.toFixed(0)}×`}
          />
        </div>

        {/* Fog cap — ceiling on an AGGREGATE glow's per-pixel peak intensity
            (leaves uncapped). Tames the box-filling glow a near sub-threshold
            aggregate deposits as luminous fog around the Sun. Deliberately
            non-physical: light above the cap is discarded. Range 0.01–0.5. */}
        <div className={styles.panelRow}>
          <Slider
            label="Fog cap"
            value={aggregateIntensityCap}
            min={0.01}
            max={0.5}
            step={0.01}
            onChange={onAggregateIntensityCapChange}
            format={(v) => v.toFixed(2)}
          />
        </div>
      </CollapsibleSection>
    </CollapsibleSection>
  );
}

export default memo(StarsSection);

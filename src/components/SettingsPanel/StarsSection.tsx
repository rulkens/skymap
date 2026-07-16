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
 * Galaxies section's point-size and brightness controls. It renders NO
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
  /** Called when the user toggles the master gate on or off. */
  onToggleMaster: (enabled: boolean) => void;
  /** Called when the user toggles a single star catalog on or off. */
  onToggleCatalog: (id: StarCatalogId, enabled: boolean) => void;
  /** Called when the user moves the star-size slider. */
  onSizeChange: (v: number) => void;
  /** Called when the user moves the star-brightness slider. */
  onBrightnessChange: (v: number) => void;
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
  onToggleMaster,
  onToggleCatalog,
  onSizeChange,
  onBrightnessChange,
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
            brightness control (same 0.2–3.0 range). 1.0 is identity: the
            flux-glow shader's calibrated STAR_FLUX_EXPOSURE baseline unchanged. */}
        <div className={styles.panelRow}>
          <label htmlFor="slider-star-brightness">Star brightness</label>
          <span className={styles.panelValue}>{brightness.toFixed(1)}×</span>
        </div>
        <div className={styles.panelRow}>
          <input
            id="slider-star-brightness"
            type="range"
            min={0.2}
            max={3.0}
            step={0.1}
            value={brightness}
            onChange={(e) => onBrightnessChange(parseFloat(e.target.value))}
          />
        </div>
      </CollapsibleSection>
    </CollapsibleSection>
  );
}

export default memo(StarsSection);

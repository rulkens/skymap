// src/components/SettingsPanel/EarthSection.tsx
/**
 * EarthSection — presentational component for the "Earth" settings subgroup
 * inside the SettingsPanel's Display section.
 *
 * Owns the Earth-specific UI: the atmosphere-shell exposure slider, the
 * night-side ambient-light slider, and the ocean-roughness slider. Rendered as
 * its own CollapsibleSection (default closed, mirroring Display) nested inside
 * the Display disclosure, so an unrelated re-render higher up does not cascade
 * into this section.
 *
 * ### Props-driven, no internal state
 *
 * Imports nothing from `store/` or `state/`: a pure function of props and the
 * transient CollapsibleSection open/closed state. Tests supply plain props
 * with no Provider.
 *
 * Why `memo`: when `EarthSectionContainer`'s parent re-renders for an
 * unrelated reason, `memo` bails on the prop-compare step. The
 * `useCallback`-wrapped handler the container passes has stable identity
 * (dispatch is invariant), making the bail effective.
 */

import { memo } from 'react';
import Slider from '../common/Slider/Slider';
import CollapsibleSection from './CollapsibleSection';
import styles from './SettingsPanel.module.css';

// ── Props ──────────────────────────────────────────────────────────────────────

export type EarthSectionProps = {
  /** Exposure scale on Earth's in-scatter atmosphere shell. */
  atmosphereExposure: number;
  /** Called with the new exposure as the slider drags. */
  onAtmosphereExposureChange: (value: number) => void;
  /** Night-side ambient floor on Earth's surface + cloud shell. */
  ambientLight: number;
  /** Called with the new ambient floor as the slider drags. */
  onAmbientLightChange: (value: number) => void;
  /** Open-water GGX roughness — the ocean sun-glint breadth. */
  oceanRoughness: number;
  /** Called with the new ocean roughness as the slider drags. */
  onOceanRoughnessChange: (value: number) => void;
};

// ── EarthSection ─────────────────────────────────────────────────────────────

/**
 * Renders the Earth subgroup: the atmosphere-shell exposure slider, the
 * night-side ambient-light slider, and the ocean-roughness slider in a
 * default-closed disclosure nested inside the Display section.
 */
function EarthSection({
  atmosphereExposure,
  onAtmosphereExposureChange,
  ambientLight,
  onAmbientLightChange,
  oceanRoughness,
  onOceanRoughnessChange,
}: EarthSectionProps) {
  return (
    <CollapsibleSection title="Earth">
      <div className={styles.panelRow}>
        <Slider
          label="Atmosphere exposure"
          value={atmosphereExposure}
          min={0}
          max={4}
          step={0.05}
          onChange={onAtmosphereExposureChange}
          format={(v) => v.toFixed(2)}
        />
      </div>
      <div className={styles.panelRow}>
        <Slider
          label="Ambient light"
          value={ambientLight}
          min={0}
          max={0.2}
          step={0.005}
          onChange={onAmbientLightChange}
          format={(v) => v.toFixed(3)}
        />
      </div>
      <div className={styles.panelRow}>
        <Slider
          label="Ocean roughness"
          value={oceanRoughness}
          min={0.02}
          max={0.6}
          step={0.01}
          onChange={onOceanRoughnessChange}
          format={(v) => v.toFixed(2)}
        />
      </div>
    </CollapsibleSection>
  );
}

export default memo(EarthSection);

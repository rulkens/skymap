/**
 * DensityFieldTuningRow — one field's tuning knobs, using `DebugSlider` to
 * match the surrounding chrome.
 */

import type { ReactElement } from 'react';
import type { CosmicWebDensityFieldId } from '../../../@types/data/volume/CosmicWebDensityFieldId';
import type { VolumeFieldSettings } from '../../../@types/settings/VolumeFieldSettings';
import { COSMIC_WEB_DENSITY_SOURCE_ROWS } from '../sources/cosmicWebDensitySourceRows';
import DebugSlider from '../../../components/DebugPanel/DebugSlider';
import { PaletteSelect } from '../../../components/common/PaletteSelect/PaletteSelect';
import styles from './DensityFieldTuningRow.module.css';

const INTENSITY_MIN = 0;
const INTENSITY_MAX = 1;
const INTENSITY_STEP = 0.01;
const CONTRAST_MIN = 0.25;
const CONTRAST_MAX = 4.0;
const CONTRAST_STEP = 0.05;
const TRIM_MIN = 0;
const TRIM_MAX = 0.95;
const TRIM_STEP = 0.01;
const EXPOSURE_MIN = 1;
const EXPOSURE_MAX = 32;
const EXPOSURE_STEP = 0.5;
const DENSITY_MIN = 0;
const DENSITY_MAX = 60;
const DENSITY_STEP = 0.1;

export type DensityFieldTuningRowProps = {
  entry: (typeof COSMIC_WEB_DENSITY_SOURCE_ROWS)[number][1];
  settings: VolumeFieldSettings;
  onChange: (id: CosmicWebDensityFieldId, patch: Partial<VolumeFieldSettings>) => void;
};

function DensityFieldTuningRow({
  entry,
  settings,
  onChange,
}: DensityFieldTuningRowProps): ReactElement {
  return (
    <div className={styles.row}>
      <div className={styles.label}>{entry.label}</div>
      <DebugSlider
        label="Intensity"
        value={settings.intensity}
        min={INTENSITY_MIN}
        max={INTENSITY_MAX}
        step={INTENSITY_STEP}
        readout={settings.intensity.toFixed(2)}
        onChange={(v) => onChange(entry.id, { intensity: v })}
      />
      <DebugSlider
        label="Contrast"
        value={settings.contrast}
        min={CONTRAST_MIN}
        max={CONTRAST_MAX}
        step={CONTRAST_STEP}
        readout={settings.contrast.toFixed(2)}
        onChange={(v) => onChange(entry.id, { contrast: v })}
      />
      <DebugSlider
        label="Trim"
        value={settings.trim}
        min={TRIM_MIN}
        max={TRIM_MAX}
        step={TRIM_STEP}
        readout={settings.trim.toFixed(2)}
        onChange={(v) => onChange(entry.id, { trim: v })}
      />
      <DebugSlider
        label="Density"
        value={settings.densityScale}
        min={DENSITY_MIN}
        max={DENSITY_MAX}
        step={DENSITY_STEP}
        readout={settings.densityScale.toFixed(1)}
        onChange={(v) => onChange(entry.id, { densityScale: v })}
      />
      <DebugSlider
        label="Exposure"
        value={settings.exposure}
        min={EXPOSURE_MIN}
        max={EXPOSURE_MAX}
        step={EXPOSURE_STEP}
        readout={settings.exposure.toFixed(1)}
        onChange={(v) => onChange(entry.id, { exposure: v })}
      />
      <div className={styles.paletteRow}>
        <span className={styles.paletteLabel}>Palette</span>
        <PaletteSelect
          value={settings.paletteId}
          onChange={(paletteId) => onChange(entry.id, { paletteId })}
        />
      </div>
    </div>
  );
}

export default DensityFieldTuningRow;

/**
 * AsteroidTuningSection: the brightness and dot sliders, then a colour row per class, dev-only. The
 * picker speaks sRGB hex, under the tints' unit luminance, so a row shows its hue at full brightness
 * and a pick keeps the row's luminance: a hue edit never changes how bright the class reads.
 */

import type { ReactElement } from 'react';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import type { AsteroidTuning } from '../../@types/AsteroidTuning';
import type { AsteroidTuningSliderKey } from '../../@types/AsteroidTuningSliderKey';
import { ASTEROID_CLASSES } from '../../../../data/asteroids/asteroidClasses';
import { ASTEROID_CLASS_LABELS } from '../data/asteroidClassLabels';
import { ASTEROID_TUNING_SLIDER_FIELDS } from '../data/asteroidTuningSliderFields';
import { formatAsteroidTuningDefaults } from '../utils/formatAsteroidTuningDefaults';
import { rec709Luminance } from '../../../../utils/color/rec709Luminance';
import { scaleToLuminance } from '../../../../utils/color/scaleToLuminance';
import { scaleToUnitMax } from '../../../../utils/color/scaleToUnitMax';
import Button from '../../../../components/common/Button/Button';
import CopyButton from '../../../../components/common/CopyButton/CopyButton';
import DebugColorRow from '../../../../components/DebugPanel/DebugColorRow';
import DebugTuningSection from '../../../../components/DebugPanel/DebugTuningSection';
import debugStyles from '../../../../components/DebugPanel/debugSection.module.css';

export type AsteroidTuningSectionProps = {
  readonly tuning: AsteroidTuning;
  readonly onColorChange: (cls: AsteroidClass, color: Vec3) => void;
  readonly onSliderChange: (key: AsteroidTuningSliderKey, value: number) => void;
  readonly onReset: () => void;
};

function AsteroidTuningSection({
  tuning,
  onColorChange,
  onSliderChange,
  onReset,
}: AsteroidTuningSectionProps): ReactElement {
  return (
    <DebugTuningSection
      title="Asteroid tuning"
      fields={ASTEROID_TUNING_SLIDER_FIELDS}
      values={tuning}
      onSliderChange={onSliderChange}
    >
      {ASTEROID_CLASSES.map((cls) => (
        <DebugColorRow
          key={cls}
          label={ASTEROID_CLASS_LABELS[cls]}
          value={scaleToUnitMax(tuning.colors[cls])}
          onChange={(color) =>
            onColorChange(cls, scaleToLuminance(color, rec709Luminance(tuning.colors[cls])))
          }
        />
      ))}
      <div className={debugStyles.buttonRow}>
        <Button onClick={onReset}>Reset to defaults</Button>
        <CopyButton
          text={formatAsteroidTuningDefaults(tuning)}
          label="Copy changed values"
          title="Changed rows under their table names, ready to paste into points/data/"
        />
      </div>
    </DebugTuningSection>
  );
}

export default AsteroidTuningSection;

/**
 * AsteroidTuningSection: the brightness and dot sliders, the size and colour modes, then a colour row
 * per class and per belt-ramp end, dev-only. The picker speaks sRGB hex, under the tints' unit
 * luminance, so a row shows its hue at full brightness and a pick keeps the row's luminance: a hue
 * edit never changes how bright the class reads.
 */

import type { ReactElement } from 'react';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import type { AsteroidTuning } from '../../@types/AsteroidTuning';
import type { AsteroidBeltRamp } from '../../@types/AsteroidBeltRamp';
import type { AsteroidColorBy } from '../../@types/AsteroidColorBy';
import type { AsteroidSizeBy } from '../../@types/AsteroidSizeBy';
import type { AsteroidTuningSliderKey } from '../../@types/AsteroidTuningSliderKey';
import { ASTEROID_CLASSES } from '../../../../data/asteroids/asteroidClasses';
import { ASTEROID_CLASS_LABELS } from '../data/asteroidClassLabels';
import { ASTEROID_BELT_RAMP_LABELS } from '../data/asteroidBeltRampLabels';
import { ASTEROID_COLOR_BY_OPTIONS } from '../data/asteroidColorByOptions';
import { ASTEROID_SIZE_BY_OPTIONS } from '../data/asteroidSizeByOptions';
import { ASTEROID_TUNING_SLIDER_FIELDS } from '../data/asteroidTuningSliderFields';
import { formatAsteroidTuningDefaults } from '../utils/formatAsteroidTuningDefaults';
import { rec709Luminance } from '../../../../utils/color/rec709Luminance';
import { scaleToLuminance } from '../../../../utils/color/scaleToLuminance';
import { scaleToUnitMax } from '../../../../utils/color/scaleToUnitMax';
import Button from '../../../../components/common/Button/Button';
import CopyButton from '../../../../components/common/CopyButton/CopyButton';
import DebugColorRow from '../../../../components/DebugPanel/DebugColorRow';
import DebugSelectRow from '../../../../components/DebugPanel/DebugSelectRow';
import DebugTuningSection from '../../../../components/DebugPanel/DebugTuningSection';
import debugStyles from '../../../../components/DebugPanel/debugSection.module.css';

export type AsteroidTuningSectionProps = {
  readonly tuning: AsteroidTuning;
  readonly onColorByChange: (mode: AsteroidColorBy) => void;
  readonly onSizeByChange: (mode: AsteroidSizeBy) => void;
  readonly onColorChange: (cls: AsteroidClass, color: Vec3) => void;
  readonly onBeltColorChange: (end: keyof AsteroidBeltRamp, color: Vec3) => void;
  readonly onSliderChange: (key: AsteroidTuningSliderKey, value: number) => void;
  readonly onReset: () => void;
};

function AsteroidTuningSection({
  tuning,
  onColorByChange,
  onSizeByChange,
  onColorChange,
  onBeltColorChange,
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
      <DebugSelectRow
        label="Size by"
        value={tuning.sizeBy}
        options={ASTEROID_SIZE_BY_OPTIONS}
        title="absoluteMagnitude grows the biggest bodies' dots (the size knee and max rows)"
        onChange={onSizeByChange}
      />
      <DebugSelectRow
        label="Colour by"
        value={tuning.colorBy}
        options={ASTEROID_COLOR_BY_OPTIONS}
        title="semiMajorAxis tints the main belt by Kirkwood band, inner to outer; other classes keep theirs"
        onChange={onColorByChange}
      />
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
      {(['inner', 'outer'] as const).map((end) => (
        <DebugColorRow
          key={end}
          label={ASTEROID_BELT_RAMP_LABELS[end]}
          value={scaleToUnitMax(tuning.beltRamp[end])}
          title="Colour by semiMajorAxis only; the middle band is the two ends' mix"
          onChange={(color) =>
            onBeltColorChange(end, scaleToLuminance(color, rec709Luminance(tuning.beltRamp[end])))
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

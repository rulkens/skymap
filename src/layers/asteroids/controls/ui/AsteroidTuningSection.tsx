/**
 * AsteroidTuningSection: dev-only. First each class's look (`AsteroidClassTuningSection`), then what
 * is the same for every class: the lift, how zoom thins the field, the size and colour modes, and the
 * belt ramp's ends. The ramp rows keep their luminance on a pick, as the class tints do.
 */

import type { ReactElement } from 'react';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import type { AsteroidTuning } from '../../@types/AsteroidTuning';
import type { AsteroidBeltRamp } from '../../@types/AsteroidBeltRamp';
import type { AsteroidColorBy } from '../../@types/AsteroidColorBy';
import type { AsteroidSizeBy } from '../../@types/AsteroidSizeBy';
import type { AsteroidTuningSliderKey } from '../../@types/AsteroidTuningSliderKey';
import type { AsteroidClassSliderKey } from '../../@types/AsteroidClassSliderKey';
import { ASTEROID_BELT_RAMP_LABELS } from '../data/asteroidBeltRampLabels';
import { ASTEROID_COLOR_BY_OPTIONS } from '../data/asteroidColorByOptions';
import { ASTEROID_SIZE_BY_OPTIONS } from '../data/asteroidSizeByOptions';
import { ASTEROID_TUNING_SLIDER_FIELDS } from '../data/asteroidTuningSliderFields';
import { formatAsteroidTuningDefaults } from '../utils/formatAsteroidTuningDefaults';
import { rec709Luminance } from '../../../../utils/color/rec709Luminance';
import { scaleToLuminance } from '../../../../utils/color/scaleToLuminance';
import { scaleToUnitMax } from '../../../../utils/color/scaleToUnitMax';
import AsteroidClassTuningSection from './AsteroidClassTuningSection';
import Button from '../../../../components/common/Button/Button';
import CopyButton from '../../../../components/common/CopyButton/CopyButton';
import DebugColorRow from '../../../../components/DebugPanel/DebugColorRow';
import DebugSection from '../../../../components/DebugPanel/DebugSection';
import DebugSelectRow from '../../../../components/DebugPanel/DebugSelectRow';
import DebugTuningSection from '../../../../components/DebugPanel/DebugTuningSection';
import debugStyles from '../../../../components/DebugPanel/debugSection.module.css';

export type AsteroidTuningSectionProps = {
  readonly tuning: AsteroidTuning;
  readonly onColorByChange: (mode: AsteroidColorBy) => void;
  readonly onSizeByChange: (mode: AsteroidSizeBy) => void;
  readonly onColorChange: (cls: AsteroidClass, color: Vec3) => void;
  readonly onClassSliderChange: (
    cls: AsteroidClass,
    key: AsteroidClassSliderKey,
    value: number,
  ) => void;
  readonly onBeltColorChange: (end: keyof AsteroidBeltRamp, color: Vec3) => void;
  readonly onSliderChange: (key: AsteroidTuningSliderKey, value: number) => void;
  readonly onReset: () => void;
};

function AsteroidTuningSection({
  tuning,
  onColorByChange,
  onSizeByChange,
  onColorChange,
  onClassSliderChange,
  onBeltColorChange,
  onSliderChange,
  onReset,
}: AsteroidTuningSectionProps): ReactElement {
  return (
    <DebugSection title="Asteroid tuning">
      <AsteroidClassTuningSection
        perClass={tuning.perClass}
        onColorChange={onColorChange}
        onSliderChange={onClassSliderChange}
      />
      <DebugTuningSection
        title="Global"
        defaultOpen
        fields={ASTEROID_TUNING_SLIDER_FIELDS}
        values={tuning}
        onSliderChange={onSliderChange}
      >
        <DebugSelectRow
          label="Size by"
          value={tuning.sizeBy}
          options={ASTEROID_SIZE_BY_OPTIONS}
          title="absoluteMagnitude grows the biggest bodies' dots (each class's size knee and max rows)"
          onChange={onSizeByChange}
        />
        <DebugSelectRow
          label="Colour by"
          value={tuning.colorBy}
          options={ASTEROID_COLOR_BY_OPTIONS}
          title="semiMajorAxis tints the main belt by Kirkwood band, inner to outer; other classes keep theirs"
          onChange={onColorByChange}
        />
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
      </DebugTuningSection>
      <div className={debugStyles.buttonRow}>
        <Button onClick={onReset}>Reset to defaults</Button>
        <CopyButton
          text={formatAsteroidTuningDefaults(tuning)}
          label="Copy changed values"
          title="Changed rows under their table names, ready to paste into points/data/"
        />
      </div>
    </DebugSection>
  );
}

export default AsteroidTuningSection;

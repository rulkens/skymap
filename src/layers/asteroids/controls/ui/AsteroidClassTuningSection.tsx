/**
 * AsteroidClassTuningSection: the rows that say what one class's dots look like, for the class the
 * Class dropdown picks. The picker speaks sRGB hex under the tint's unit luminance, so the row shows
 * the hue at full brightness and a pick keeps the tint's luminance: a hue edit never changes how
 * bright the class reads (that is the Brightness row's job).
 */

import { useState, type ReactElement } from 'react';
import type { Vec3 } from '../../../../../packages/shared/src/@types/math/Vec3';
import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import type { AsteroidClassLook } from '../../@types/AsteroidClassLook';
import type { AsteroidClassSliderKey } from '../../@types/AsteroidClassSliderKey';
import { ASTEROID_CLASSES } from '../../../../data/asteroids/asteroidClasses';
import { ASTEROID_CLASS_LABELS } from '../data/asteroidClassLabels';
import { ASTEROID_CLASS_SLIDER_FIELDS } from '../data/asteroidClassSliderFields';
import { rec709Luminance } from '../../../../utils/color/rec709Luminance';
import { scaleToLuminance } from '../../../../utils/color/scaleToLuminance';
import { scaleToUnitMax } from '../../../../utils/color/scaleToUnitMax';
import DebugColorRow from '../../../../components/DebugPanel/DebugColorRow';
import DebugSection from '../../../../components/DebugPanel/DebugSection';
import DebugSelectRow from '../../../../components/DebugPanel/DebugSelectRow';
import DebugSlider from '../../../../components/DebugPanel/DebugSlider';

export type AsteroidClassTuningSectionProps = {
  readonly perClass: Readonly<Record<AsteroidClass, AsteroidClassLook>>;
  readonly onColorChange: (cls: AsteroidClass, color: Vec3) => void;
  readonly onSliderChange: (cls: AsteroidClass, key: AsteroidClassSliderKey, value: number) => void;
};

function AsteroidClassTuningSection({
  perClass,
  onColorChange,
  onSliderChange,
}: AsteroidClassTuningSectionProps): ReactElement {
  const [cls, setCls] = useState<AsteroidClass>('mainBelt');
  const look = perClass[cls];
  return (
    <DebugSection title="Per class" defaultOpen>
      <DebugSelectRow
        label="Class"
        value={cls}
        options={ASTEROID_CLASSES}
        title="Which class the rows below edit"
        onChange={setCls}
      />
      <DebugColorRow
        label="Colour"
        value={scaleToUnitMax(look.color)}
        title={ASTEROID_CLASS_LABELS[cls]}
        onChange={(color) =>
          onColorChange(cls, scaleToLuminance(color, rec709Luminance(look.color)))
        }
      />
      {ASTEROID_CLASS_SLIDER_FIELDS.map((f) => (
        <DebugSlider
          key={f.key}
          label={f.label}
          value={look[f.key]}
          min={f.min}
          max={f.max}
          step={f.step}
          readout={f.format(look[f.key])}
          title={f.title}
          onChange={(v) => onSliderChange(cls, f.key, v)}
        />
      ))}
    </DebugSection>
  );
}

export default AsteroidClassTuningSection;

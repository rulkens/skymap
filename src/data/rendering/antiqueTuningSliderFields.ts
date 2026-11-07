import type { SliderField } from '../../@types/data/SliderField';
import type { AntiqueTuning } from '../../@types/settings/AntiqueTuning';
import type { OrientationFrameId } from '../../@types/camera/orientation/OrientationFrameId';

type AntiqueSliderKey = 'hatchUnits' | 'hatchAngleDeg' | 'washGain' | 'inkGain' | 'reliefLightDeg';

/** The antique look's sliders in the DebugPanel; the rest of `AntiqueTuning` has its own controls. */
export const ANTIQUE_TUNING_SLIDER_FIELDS: readonly SliderField<
  AntiqueSliderKey & keyof AntiqueTuning
>[] = [
  {
    key: 'hatchUnits',
    label: 'Hatch spacing',
    min: 1.5,
    max: 10,
    step: 0.1,
    format: (v) => `${v.toFixed(1)} u`,
    title: 'Body hatch spacing, print units (1 unit = 1 CSS px at 900 px tall)',
  },
  {
    key: 'hatchAngleDeg',
    label: 'Hatch angle',
    min: -90,
    max: 90,
    step: 1,
    format: (v) => `${v.toFixed(0)}°`,
    title: 'Turns the body hatching off the terminator-parallel angle',
  },
  {
    key: 'washGain',
    label: 'Sky wash',
    min: 0,
    max: 3,
    step: 0.05,
    format: (v) => `×${v.toFixed(2)}`,
    title: 'Hand colour on glows, structures and galaxies',
  },
  {
    key: 'inkGain',
    label: 'Ink density',
    min: 0.2,
    max: 3,
    step: 0.05,
    format: (v) => `×${v.toFixed(2)}`,
    title: 'Ink per stroke: 2 prints every line as two passes',
  },
  {
    key: 'reliefLightDeg',
    label: 'Relief light',
    min: 2,
    max: 80,
    step: 1,
    format: (v) => `${v.toFixed(0)}°`,
    title: 'Plate light elevation over the Mars ground, seen from orbit',
  },
];

/** The sky rulings select: follow the orientation setting, or force one frame. */
export const ANTIQUE_SKY_RULINGS_OPTIONS: readonly {
  readonly value: OrientationFrameId | 'orientation';
  readonly label: string;
}[] = [
  { value: 'orientation', label: 'Follow orientation' },
  { value: 'equatorial', label: 'Equatorial' },
  { value: 'ecliptic', label: 'Ecliptic' },
  { value: 'galactic', label: 'Galactic' },
  { value: 'supergalactic', label: 'Supergalactic' },
];

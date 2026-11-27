/** RaymarchRows — the Rendering section's rows while the raymarch is the renderer. */
import type { ReactNode } from 'react';
import type { ScalarFieldPaletteId } from '../../../../../shared/src/@types/data/volume/ScalarFieldPaletteId';
import type { ViewSlice } from '../../../../@types/view/ViewSlice';
import PaletteRow from '../PaletteRow/PaletteRow';
import SliderRows from '../../panel/SliderRows/SliderRows';
import ToggleRow from '../../panel/ToggleRow/ToggleRow';
import SubsectionGroup from '../../panel/SubsectionGroup/SubsectionGroup';
import { RAYMARCH_PREVIEW_SLIDER_FIELDS } from './data/raymarchPreviewSliderFields.constant';
import { RAYMARCH_SLIDER_FIELDS } from './data/raymarchSliderFields.constant';

export type RaymarchRowsProps = {
  readonly raymarch: ViewSlice['raymarch'];
  readonly onAdditiveChange: (on: boolean) => void;
  readonly onPreviewPackedChange: (on: boolean) => void;
  readonly onPaletteChange: (id: ScalarFieldPaletteId) => void;
  /** Both groups' rows: the Trace knobs and the Preview divisor. */
  readonly onSliderChange: (
    key: (typeof RAYMARCH_SLIDER_FIELDS | typeof RAYMARCH_PREVIEW_SLIDER_FIELDS)[number]['key'],
    value: number,
  ) => void;
};

function RaymarchRows({
  raymarch,
  onAdditiveChange,
  onPreviewPackedChange,
  onPaletteChange,
  onSliderChange,
}: RaymarchRowsProps): ReactNode {
  return (
    <>
      {/* Additive off is fork parity: per-slab 'over', opaque a few voxels in. */}
      <ToggleRow
        label="additive blend"
        on={raymarch.additive}
        info="Adds brightness along each ray, so dense regions show through. Off, nearer structure hides what is behind it, as in Polyphorm."
        onChange={onAdditiveChange}
      />
      {/* On demand, not a mode — watchPreviewPackedSaga packs once on the
          rising edge and un-checks this itself once the sim steps past that
          snapshot. */}
      <ToggleRow
        label="preview packed export"
        on={raymarch.previewPacked}
        info="Marches the packed export cube (real packLogTraceVoxels) instead of the live trace — a structure check, not a brightness match. Goes stale and reverts on the next sim step."
        onChange={onPreviewPackedChange}
      />
      <PaletteRow value={raymarch.paletteId} onChange={onPaletteChange} />
      <SubsectionGroup title="Trace">
        <SliderRows
          fields={RAYMARCH_SLIDER_FIELDS}
          values={raymarch}
          path="view.raymarch"
          onChange={onSliderChange}
        />
      </SubsectionGroup>
      <SubsectionGroup title="Preview">
        <SliderRows
          fields={RAYMARCH_PREVIEW_SLIDER_FIELDS}
          values={raymarch}
          path="view.raymarch"
          onChange={onSliderChange}
        />
      </SubsectionGroup>
    </>
  );
}

export default RaymarchRows;

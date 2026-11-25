/** RaymarchRows — the Rendering section's rows while the raymarch is the renderer. */
import type { ReactNode } from 'react';
import {
  setAdditive,
  setDivisor,
  setPreviewPacked,
  setRaymarchPaletteId,
  setRaymarchParam,
} from '../../../state/view/viewSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import PaletteRow from '../PaletteRow/PaletteRow';
import SliderRows from '../../panel/SliderRows/SliderRows';
import ToggleRow from '../../panel/ToggleRow/ToggleRow';
import SubsectionGroup from '../../panel/SubsectionGroup/SubsectionGroup';
import { PALETTE_INFO } from '../PaletteRow/data/paletteInfo.constant';
import { RAYMARCH_PREVIEW_SLIDER_FIELDS } from './data/raymarchPreviewSliderFields.constant';
import { RAYMARCH_SLIDER_FIELDS } from './data/raymarchSliderFields.constant';

function RaymarchRows(): ReactNode {
  const dispatch = useAppDispatch();
  const raymarch = useAppSelector((s) => s.view.raymarch);
  return (
    <>
      {/* Additive off is fork parity: per-slab 'over', opaque a few voxels in. */}
      <ToggleRow
        label="additive blend"
        on={raymarch.additive}
        info="Adds brightness along each ray, so dense regions show through. Off, nearer structure hides what is behind it, as in Polyphorm."
        onChange={(on) => dispatch(setAdditive(on))}
      />
      {/* T18: on demand, not a mode — watchPreviewPackedSaga packs once on the
          rising edge and un-checks this itself once the sim steps past that
          snapshot. */}
      <ToggleRow
        label="preview packed export"
        on={raymarch.previewPacked}
        info="Marches the packed export cube (real packLogTraceVoxels) instead of the live trace — a structure check, not a brightness match. Goes stale and reverts on the next sim step."
        onChange={(on) => dispatch(setPreviewPacked(on))}
      />
      <PaletteRow
        value={raymarch.paletteId}
        onChange={(id) => dispatch(setRaymarchPaletteId(id))}
        info={PALETTE_INFO}
      />
      <SubsectionGroup title="Trace">
        <SliderRows
          fields={RAYMARCH_SLIDER_FIELDS}
          values={raymarch}
          path="view.raymarch"
          onChange={(key, value) => dispatch(setRaymarchParam({ key, value }))}
        />
      </SubsectionGroup>
      <SubsectionGroup title="Preview">
        <SliderRows
          fields={RAYMARCH_PREVIEW_SLIDER_FIELDS}
          values={raymarch}
          path="view.raymarch"
          onChange={(_, value) => dispatch(setDivisor(value))}
        />
      </SubsectionGroup>
    </>
  );
}

export default RaymarchRows;

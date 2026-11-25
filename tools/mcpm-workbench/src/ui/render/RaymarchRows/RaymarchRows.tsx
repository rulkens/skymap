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
import SliderRow from '../../panel/SliderRow/SliderRow';
import ToggleRow from '../../panel/ToggleRow/ToggleRow';
import SubsectionGroup from '../../panel/SubsectionGroup/SubsectionGroup';
import { LOG10_DISPLAYED } from '../../panel/data/log10Displayed.constant';
import { PALETTE_INFO } from '../PaletteRow/data/paletteInfo.constant';
import { RAYMARCH_SLIDERS } from './data/raymarchSliders.constant';

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
        {RAYMARCH_SLIDERS.map((spec) => (
          <SliderRow
            key={spec.key}
            label={spec.label}
            value={spec.log ? Math.log10(raymarch[spec.key]) : raymarch[spec.key]}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            format={spec.format}
            displayed={spec.log ? LOG10_DISPLAYED : undefined}
            info={spec.info}
            onChange={(v) =>
              dispatch(setRaymarchParam({ key: spec.key, value: spec.log ? Math.pow(10, v) : v }))
            }
            path={`view.raymarch.${spec.key}`}
          />
        ))}
      </SubsectionGroup>
      <SubsectionGroup title="Preview">
        <SliderRow
          label="divisor"
          value={raymarch.divisor}
          min={1}
          max={8}
          step={1}
          format={(v) => v.toFixed(0)}
          info="Marches into a floor(size/divisor) offscreen target and bilinear-upsamples it in, instead of straight into the frame. Fragment cost falls with the square of the divisor; 3 matches the main app's volume row."
          onChange={(v) => dispatch(setDivisor(v))}
          path="view.raymarch.divisor"
        />
      </SubsectionGroup>
    </>
  );
}

export default RaymarchRows;

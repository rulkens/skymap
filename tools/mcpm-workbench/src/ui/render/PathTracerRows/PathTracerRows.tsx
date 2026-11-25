/** PathTracerRows — the Rendering section's rows while the path tracer is the renderer. */
import type { ReactNode } from 'react';
import {
  setPathTracerCompressive,
  setPathTracerDivisor,
  setPathTracerPaletteId,
  setPathTracerParam,
  setPathTracerSampleCap,
} from '../../../state/view/viewSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import PaletteRow from '../PaletteRow/PaletteRow';
import SliderRows from '../../panel/SliderRows/SliderRows';
import ToggleRow from '../../panel/ToggleRow/ToggleRow';
import SubsectionGroup from '../../panel/SubsectionGroup/SubsectionGroup';
import { PALETTE_INFO } from '../PaletteRow/data/paletteInfo.constant';
import { PATH_TRACER_PREVIEW_SLIDER_FIELDS } from './data/pathTracerPreviewSliderFields.constant';
import { PATH_TRACER_SLIDER_FIELDS } from './data/pathTracerSliderFields.constant';

function PathTracerRows(): ReactNode {
  const dispatch = useAppDispatch();
  const pathTracer = useAppSelector((s) => s.view.pathTracer);
  return (
    <>
      <PaletteRow
        value={pathTracer.paletteId}
        onChange={(id) => dispatch(setPathTracerPaletteId(id))}
        info={PALETTE_INFO}
      />
      <SubsectionGroup title="Trace">
        <SliderRows
          fields={PATH_TRACER_SLIDER_FIELDS}
          values={pathTracer}
          path="view.pathTracer"
          onChange={(key, value) => dispatch(setPathTracerParam({ key, value }))}
        />
      </SubsectionGroup>
      <SubsectionGroup title="Preview">
        <SliderRows
          fields={PATH_TRACER_PREVIEW_SLIDER_FIELDS}
          values={pathTracer}
          path="view.pathTracer"
          onChange={(key, value) =>
            dispatch(
              key === 'divisor' ? setPathTracerDivisor(value) : setPathTracerSampleCap(value),
            )
          }
        />
      </SubsectionGroup>
      <ToggleRow
        label="compressive"
        on={pathTracer.compressive}
        info="Tonemap each sample before accumulating (the fork's LDR accumulation) instead of averaging linear radiance."
        onChange={(on) => dispatch(setPathTracerCompressive(on))}
      />
    </>
  );
}

export default PathTracerRows;

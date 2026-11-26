/** PathTracerRows — the Rendering section's rows while the path tracer is the renderer. */
import type { ReactNode } from 'react';
import type { ScalarFieldPaletteId } from '../../../../../../src/@types/data/volume/ScalarFieldPaletteId';
import type { ViewSlice } from '../../../../@types/view/ViewSlice';
import PaletteRow from '../PaletteRow/PaletteRow';
import SliderRows from '../../panel/SliderRows/SliderRows';
import ToggleRow from '../../panel/ToggleRow/ToggleRow';
import SubsectionGroup from '../../panel/SubsectionGroup/SubsectionGroup';
import { PALETTE_INFO } from '../data/paletteInfo.constant';
import { PATH_TRACER_PREVIEW_SLIDER_FIELDS } from './data/pathTracerPreviewSliderFields.constant';
import { PATH_TRACER_SLIDER_FIELDS } from './data/pathTracerSliderFields.constant';

export type PathTracerRowsProps = {
  readonly pathTracer: ViewSlice['pathTracer'];
  readonly onPaletteChange: (id: ScalarFieldPaletteId) => void;
  /** Both groups' rows: the Trace knobs and the Preview divisor and sample cap. */
  readonly onSliderChange: (
    key: (
      | typeof PATH_TRACER_SLIDER_FIELDS
      | typeof PATH_TRACER_PREVIEW_SLIDER_FIELDS
    )[number]['key'],
    value: number,
  ) => void;
  readonly onCompressiveChange: (on: boolean) => void;
};

function PathTracerRows({
  pathTracer,
  onPaletteChange,
  onSliderChange,
  onCompressiveChange,
}: PathTracerRowsProps): ReactNode {
  return (
    <>
      <PaletteRow value={pathTracer.paletteId} onChange={onPaletteChange} info={PALETTE_INFO} />
      <SubsectionGroup title="Trace">
        <SliderRows
          fields={PATH_TRACER_SLIDER_FIELDS}
          values={pathTracer}
          path="view.pathTracer"
          onChange={onSliderChange}
        />
      </SubsectionGroup>
      <SubsectionGroup title="Preview">
        <SliderRows
          fields={PATH_TRACER_PREVIEW_SLIDER_FIELDS}
          values={pathTracer}
          path="view.pathTracer"
          onChange={onSliderChange}
        />
      </SubsectionGroup>
      <ToggleRow
        label="compressive"
        on={pathTracer.compressive}
        info="Tonemap each sample before accumulating (the fork's LDR accumulation) instead of averaging linear radiance."
        onChange={onCompressiveChange}
      />
    </>
  );
}

export default PathTracerRows;

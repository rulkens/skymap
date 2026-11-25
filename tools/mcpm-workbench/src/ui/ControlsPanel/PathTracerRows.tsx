/** PathTracerRows — the Rendering section's rows while the path tracer is the renderer. */
import type { ReactNode } from 'react';
import {
  setPathTracerCompressive,
  setPathTracerDivisor,
  setPathTracerPaletteId,
  setPathTracerParam,
  setPathTracerSampleCap,
} from '../../state/view/viewSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import PaletteRow from '../PaletteRow/PaletteRow';
import SliderRow from '../SliderRow/SliderRow';
import ToggleRow from '../ToggleRow/ToggleRow';
import SubsectionGroup from './SubsectionGroup';
import { PALETTE_INFO } from './utils/PALETTE_INFO';
import { PATHTRACER_SLIDERS } from './utils/PATHTRACER_SLIDERS';

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
        {PATHTRACER_SLIDERS.map((spec) => (
          <SliderRow
            key={spec.key}
            label={spec.label}
            value={spec.log ? Math.log10(pathTracer[spec.key]) : pathTracer[spec.key]}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            format={spec.format}
            info={spec.info}
            onChange={(v) =>
              dispatch(setPathTracerParam({ key: spec.key, value: spec.log ? Math.pow(10, v) : v }))
            }
            path={`view.pathTracer.${spec.key}`}
          />
        ))}
      </SubsectionGroup>
      <SubsectionGroup title="Preview">
        <SliderRow
          label="path tracer divisor"
          value={pathTracer.divisor}
          min={1}
          max={4}
          step={1}
          format={(v) => v.toFixed(0)}
          info="Accumulates into floor(size/divisor), samples/sec up with divisor². Auto-boosts to 4 while the camera moves."
          onChange={(v) => dispatch(setPathTracerDivisor(v))}
          path="view.pathTracer.divisor"
        />
        <SliderRow
          label="sample cap"
          value={pathTracer.sampleCap}
          min={64}
          max={4096}
          step={64}
          format={(v) => v.toFixed(0)}
          info="Progressive accumulator stops forcing a render past this many samples (Monte Carlo noise falls as 1/sqrt(N)). Raising it while capped resumes accumulation without a reset; lowering it just goes idle sooner."
          onChange={(v) => dispatch(setPathTracerSampleCap(v))}
          path="view.pathTracer.sampleCap"
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

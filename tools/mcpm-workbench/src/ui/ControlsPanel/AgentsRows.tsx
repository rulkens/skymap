/** AgentsRows — the Rendering section's rows while the agent splat is the renderer. */
import type { ReactNode } from 'react';
import { setAgentIntensity, setAgentPointSize } from '../../state/view/viewSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import SliderRow from '../SliderRow/SliderRow';

function AgentsRows(): ReactNode {
  const dispatch = useAppDispatch();
  const agents = useAppSelector((s) => s.view.agents);
  return (
    <>
      <SliderRow
        label="intensity"
        value={agents.intensity}
        min={0.05}
        max={3}
        step={0.05}
        format={(v) => v.toFixed(2)}
        info="Brightness multiplier on the resolved agent splat."
        onChange={(v) => dispatch(setAgentIntensity(v))}
        path="view.agents.intensity"
      />
      <SliderRow
        label="point size"
        value={agents.pointSizePx}
        min={1}
        max={8}
        step={1}
        format={(v) => v.toFixed(0)}
        info="Per-agent splat footprint, in whole pixels — the splat compute kernel writes a discrete square, unlike the Galaxies layer's continuously-sized quad."
        onChange={(v) => dispatch(setAgentPointSize(v))}
        path="view.agents.pointSizePx"
      />
    </>
  );
}

export default AgentsRows;

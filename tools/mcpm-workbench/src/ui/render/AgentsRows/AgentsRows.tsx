/** AgentsRows — the Rendering section's rows while the agent splat is the renderer. */
import type { ReactNode } from 'react';
import { setAgentIntensity, setAgentPointSize } from '../../../state/view/viewSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import SliderRows from '../../panel/SliderRows/SliderRows';
import { AGENTS_SLIDER_FIELDS } from './data/agentsSliderFields.constant';

function AgentsRows(): ReactNode {
  const dispatch = useAppDispatch();
  const agents = useAppSelector((s) => s.view.agents);
  return (
    <SliderRows
      fields={AGENTS_SLIDER_FIELDS}
      values={agents}
      path="view.agents"
      onChange={(key, value) =>
        dispatch(key === 'intensity' ? setAgentIntensity(value) : setAgentPointSize(value))
      }
    />
  );
}

export default AgentsRows;

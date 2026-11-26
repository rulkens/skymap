/** AgentsRows — the Rendering section's rows while the agent splat is the renderer. */
import type { ReactNode } from 'react';
import type { ViewSlice } from '../../../../@types/view/ViewSlice';
import SliderRows from '../../panel/SliderRows/SliderRows';
import { AGENTS_SLIDER_FIELDS } from './data/agentsSliderFields.constant';

export type AgentsRowsProps = {
  readonly agents: ViewSlice['agents'];
  readonly onSliderChange: (key: keyof ViewSlice['agents'], value: number) => void;
};

function AgentsRows({ agents, onSliderChange }: AgentsRowsProps): ReactNode {
  return (
    <SliderRows
      fields={AGENTS_SLIDER_FIELDS}
      values={agents}
      path="view.agents"
      onChange={onSliderChange}
    />
  );
}

export default AgentsRows;

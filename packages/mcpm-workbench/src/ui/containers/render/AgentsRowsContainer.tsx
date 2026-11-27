/** AgentsRowsContainer — store boundary for the agent splat's Rendering rows. */
import { memo, useCallback, type ReactNode } from 'react';
import { setAgentIntensity, setAgentPointSize } from '../../../state/view/viewSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import AgentsRows, { type AgentsRowsProps } from '../../render/AgentsRows/AgentsRows';

function AgentsRowsContainer(): ReactNode {
  const dispatch = useAppDispatch();
  const agents = useAppSelector((s) => s.view.agents);
  const onSliderChange = useCallback<AgentsRowsProps['onSliderChange']>(
    (key, value) =>
      dispatch(key === 'intensity' ? setAgentIntensity(value) : setAgentPointSize(value)),
    [dispatch],
  );
  return <AgentsRows agents={agents} onSliderChange={onSliderChange} />;
}

export default memo(AgentsRowsContainer);

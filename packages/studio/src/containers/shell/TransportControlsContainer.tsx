import { useAppSelector } from '../../../../../src/store/hooks';
import TransportControls from '../../shell/components/TransportControls/TransportControls';
import { selectLoop, selectTransport } from '../../session/state/selectors';
import { selectSelectedRow } from '../../timeline/state/selectSelectedRow';
import { useStudioCommand } from './useStudioCommand';

function TransportControlsContainer() {
  const run = useStudioCommand();
  return (
    <TransportControls
      loop={useAppSelector(selectLoop)}
      transport={useAppSelector(selectTransport)}
      hasSelection={useAppSelector(selectSelectedRow) !== null}
      onLoop={() => run('loop')}
      onFollow={() => run('follow')}
    />
  );
}

export default TransportControlsContainer;

import { useAppDispatch } from '../../../../../src/store/hooks';
import StartModeField from '../../inspector/components/StartModeField/StartModeField';
import { startModeSet } from '../../session/state/studioSlice';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';

type StartModeFieldContainerProps = { readonly start: ClipData['start'] };

function StartModeFieldContainer({ start }: StartModeFieldContainerProps) {
  const dispatch = useAppDispatch();
  return <StartModeField start={start} onChange={(mode) => dispatch(startModeSet(mode))} />;
}

export default StartModeFieldContainer;

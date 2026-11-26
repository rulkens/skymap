import { useAppDispatch, useAppSelector } from '../../../../../src/store/hooks';
import CurrentViewButton from '../../inspector/components/CurrentViewButton/CurrentViewButton';
import { selectTransport } from '../../session/state/selectors';
import { viewUsed } from '../../session/state/studioSlice';
import type { RowRef } from '../../@types/rows/RowRef';

type CurrentViewButtonContainerProps = { readonly rowRef: RowRef };

function CurrentViewButtonContainer({ rowRef }: CurrentViewButtonContainerProps) {
  const dispatch = useAppDispatch();
  return (
    <CurrentViewButton
      transport={useAppSelector(selectTransport)}
      onUse={() => dispatch(viewUsed(rowRef))}
    />
  );
}

export default CurrentViewButtonContainer;

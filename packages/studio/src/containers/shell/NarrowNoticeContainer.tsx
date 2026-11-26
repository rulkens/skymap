import { useAppDispatch } from '../../../../../src/store/hooks';
import { exitTakeover } from '../../../../../src/state/takeover/takeoverActions';
import NarrowNotice from '../../shell/components/NarrowNotice/NarrowNotice';

function NarrowNoticeContainer() {
  const dispatch = useAppDispatch();
  return <NarrowNotice onClose={() => dispatch(exitTakeover())} />;
}

export default NarrowNoticeContainer;

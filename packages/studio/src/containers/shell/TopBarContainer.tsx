import { useAppDispatch, useAppSelector } from '../../../../../src/store/hooks';
import { exitTakeover } from '../../../../../src/state/takeover/takeoverActions';
import TopBar from '../../shell/components/TopBar/TopBar';
import { redone, undone } from '../../session/state/studioSlice';
import {
  selectCurrentResolution,
  selectIsDirty,
  selectRedoLabel,
  selectStudioClipId,
  selectUndoLabel,
} from '../../session/state/selectors';
import { selectFullTimeline } from '../../timeline/state/selectFullTimeline';

type TopBarContainerProps = {
  readonly keysOpen: boolean;
  readonly onToggleKeys: () => void;
};

function TopBarContainer({ keysOpen, onToggleKeys }: TopBarContainerProps) {
  const dispatch = useAppDispatch();
  return (
    <TopBar
      keysOpen={keysOpen}
      onToggleKeys={onToggleKeys}
      clipId={useAppSelector(selectStudioClipId)}
      timeline={useAppSelector(selectFullTimeline)}
      resolution={useAppSelector(selectCurrentResolution)}
      dirty={useAppSelector(selectIsDirty)}
      undoLabel={useAppSelector(selectUndoLabel)}
      redoLabel={useAppSelector(selectRedoLabel)}
      onUndo={() => dispatch(undone())}
      onRedo={() => dispatch(redone())}
      onClose={() => dispatch(exitTakeover())}
    />
  );
}

export default TopBarContainer;

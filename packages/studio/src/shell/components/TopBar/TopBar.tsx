import StudioTip from '../../../primitives/components/StudioTip/StudioTip';
import Glyph from '../../../primitives/components/Glyph/Glyph';
import ZoomControls from '../../../timeline/components/ZoomControls/ZoomControls';
import Button from '../../../../../../src/components/common/Button/Button';
import CloseIcon from '../../../../../../src/components/icons/CloseIcon/CloseIcon';
import { clipRegistry } from '../../../../../../src/data/animation/clips/clipRegistry';
import { exitTakeover } from '../../../../../../src/state/takeover/takeoverActions';
import { redone, undone } from '../../../session/state/studioSlice';
import {
  selectCurrentResolution,
  selectIsDirty,
  selectRedoLabel,
  selectStudioClipId,
  selectUndoLabel,
} from '../../../session/state/selectors';
import { selectFullTimeline } from '../../../timeline/state/selectFullTimeline';
import { compileErrorLine } from '../../utils/compileErrorLine';
import { useAppDispatch, useAppSelector } from '../../../../../../src/store/hooks';
import s from './TopBar.module.css';

type Props = {
  readonly keysOpen: boolean;
  readonly onToggleKeys: () => void;
};

/** Three groups aligned with the dock's columns below: the clip and its state | zoom | undo, keys, close. */
function TopBar({ keysOpen, onToggleKeys }: Props) {
  const dispatch = useAppDispatch();
  const clipId = useAppSelector(selectStudioClipId);
  // The full tree: a culprit folded inside a group still names itself here.
  const timeline = useAppSelector(selectFullTimeline);
  const resolution = useAppSelector(selectCurrentResolution);
  const dirty = useAppSelector(selectIsDirty);
  const undoLabel = useAppSelector(selectUndoLabel);
  const redoLabel = useAppSelector(selectRedoLabel);

  const failure =
    timeline?.error != null
      ? compileErrorLine(timeline.error, timeline.rows)
      : resolution !== null && 'message' in resolution
        ? resolution.message
        : null;
  const resolving = failure === null && resolution === null;

  return (
    <header className={s.root} aria-label="Clip">
      <div className={s.left}>
        <h2 className={s.title}>{clipId === null ? '' : clipRegistry[clipId].label}</h2>
        <span className={s.tag}>Hand-written</span>
        {failure !== null ? (
          <span className={s.alert} role="alert">
            <Glyph id="warn" size={14} />
            {failure}
          </span>
        ) : (
          <>
            {dirty && (
              <span className={s.dirty} role="status">
                ● Unsaved
              </span>
            )}
            {resolving && (
              <span className={s.status} role="status">
                Resolving subjects
              </span>
            )}
          </>
        )}
      </div>
      <div className={s.centre}>
        <ZoomControls />
      </div>
      <div className={s.right}>
        <StudioTip name="Undo" keys={['⌘', 'Z']} state={undoLabel ?? undefined}>
          <Button
            size="compact"
            aria-label={undoLabel === null ? 'Undo' : `Undo ${undoLabel}`}
            disabled={undoLabel === null}
            onClick={() => dispatch(undone())}
          >
            <Glyph id="undo" size={16} />
          </Button>
        </StudioTip>
        <StudioTip name="Redo" keys={['⇧', '⌘', 'Z']} state={redoLabel ?? undefined}>
          <Button
            size="compact"
            aria-label={redoLabel === null ? 'Redo' : `Redo ${redoLabel}`}
            disabled={redoLabel === null}
            onClick={() => dispatch(redone())}
          >
            <Glyph id="redo" size={16} />
          </Button>
        </StudioTip>
        <span className={s.grow} />
        <StudioTip name="Keys" keys={['?']}>
          <Button
            size="compact"
            aria-label="Keyboard shortcuts"
            aria-pressed={keysOpen}
            onClick={onToggleKeys}
          >
            ?
          </Button>
        </StudioTip>
        <StudioTip name="Close studio" keys={['Esc']}>
          <Button size="compact" aria-label="Close studio" onClick={() => dispatch(exitTakeover())}>
            <CloseIcon size={16} />
          </Button>
        </StudioTip>
      </div>
    </header>
  );
}

export default TopBar;

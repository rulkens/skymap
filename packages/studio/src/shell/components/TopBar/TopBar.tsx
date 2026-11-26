import StudioTip from '../../../primitives/components/StudioTip/StudioTip';
import Glyph from '../../../primitives/components/Glyph/Glyph';
import ClipPickerContainer from '../../../containers/shell/ClipPickerContainer';
import ZoomControlsContainer from '../../../containers/timeline/ZoomControlsContainer';
import Button from '../../../../../../src/components/common/Button/Button';
import CloseIcon from '../../../../../../src/components/icons/CloseIcon/CloseIcon';
import { compileErrorLine } from '../../utils/compileErrorLine';
import type { ClipId } from '../../../../../../src/@types/animation/ClipId';
import type { Timeline } from '../../../@types/rows/Timeline';
import type { StudioResolution } from '../../../@types/session/StudioResolution';
import s from './TopBar.module.css';

type TopBarProps = {
  readonly keysOpen: boolean;
  readonly onToggleKeys: () => void;
  readonly clipId: ClipId | null;
  /** The full tree: a culprit folded inside a group still names itself here. */
  readonly timeline: Timeline | null;
  readonly resolution: StudioResolution | null;
  readonly dirty: boolean;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onClose: () => void;
};

/** Three groups aligned with the dock's columns below: the clip and its state | zoom | undo, keys, close. */
function TopBar({
  keysOpen,
  onToggleKeys,
  clipId,
  timeline,
  resolution,
  dirty,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
  onClose,
}: TopBarProps) {
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
        {clipId !== null && <ClipPickerContainer clipId={clipId} />}
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
        <ZoomControlsContainer />
      </div>
      <div className={s.right}>
        <StudioTip name="Undo" keys={['⌘', 'Z']} state={undoLabel ?? undefined}>
          <Button
            size="compact"
            aria-label={undoLabel === null ? 'Undo' : `Undo ${undoLabel}`}
            disabled={undoLabel === null}
            onClick={onUndo}
          >
            <Glyph id="undo" size={16} />
          </Button>
        </StudioTip>
        <StudioTip name="Redo" keys={['⇧', '⌘', 'Z']} state={redoLabel ?? undefined}>
          <Button
            size="compact"
            aria-label={redoLabel === null ? 'Redo' : `Redo ${redoLabel}`}
            disabled={redoLabel === null}
            onClick={onRedo}
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
          <Button size="compact" aria-label="Close studio" onClick={onClose}>
            <CloseIcon size={16} />
          </Button>
        </StudioTip>
      </div>
    </header>
  );
}

export default TopBar;

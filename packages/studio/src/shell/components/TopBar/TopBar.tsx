import StudioTip from '../../../primitives/components/StudioTip/StudioTip';
import Glyph from '../../../primitives/components/Glyph/Glyph';
import ClipPickerContainer from '../../../containers/shell/ClipPickerContainer';
import TransportControlsContainer from '../../../containers/shell/TransportControlsContainer';
import ZoomControlsContainer from '../../../containers/timeline/ZoomControlsContainer';
import Button from '../../../../../../src/components/common/Button/Button';
import CloseIcon from '../../../../../../src/components/icons/CloseIcon/CloseIcon';
import type { ClipId } from '../../../../../../src/@types/animation/ClipId';
import type { StudioResolution } from '../../../@types/session/StudioResolution';
import s from './TopBar.module.css';

type TopBarProps = {
  readonly keysOpen: boolean;
  readonly onToggleKeys: () => void;
  readonly clipId: ClipId | null;
  readonly resolution: StudioResolution | null;
  /** Why the current revision cannot play; null while it resolves or once it compiles. */
  readonly failure: string | null;
  readonly dirty: boolean;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onClose: () => void;
};

/** Three groups aligned with the dock's columns below: the clip and its state | transport, zoom | undo, keys, close. */
function TopBar({
  keysOpen,
  onToggleKeys,
  clipId,
  resolution,
  failure,
  dirty,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
  onClose,
}: TopBarProps) {
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
        <TransportControlsContainer />
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

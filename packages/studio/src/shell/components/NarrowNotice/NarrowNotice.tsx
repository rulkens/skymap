import Button from '../../../../../../src/components/common/Button/Button';
import CloseIcon from '../../../../../../src/components/icons/CloseIcon/CloseIcon';
import PlayButtonContainer from '../../../containers/shell/PlayButtonContainer';
import s from './NarrowNotice.module.css';

type NarrowNoticeProps = { readonly onClose: () => void };

/** Q13: below the narrow breakpoint the studio has nothing to edit on, so it says so; the preview still plays. */
function NarrowNotice({ onClose }: NarrowNoticeProps) {
  return (
    <div className={s.root}>
      <p className={s.text}>Needs a wider screen</p>
      <div className={s.actions}>
        <PlayButtonContainer />
        <Button size="compact" onClick={onClose}>
          <CloseIcon size={14} />
          Close
        </Button>
      </div>
    </div>
  );
}

export default NarrowNotice;

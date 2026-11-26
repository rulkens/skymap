import Button from '../../../../../../src/components/common/Button/Button';
import CloseIcon from '../../../../../../src/components/icons/CloseIcon/CloseIcon';
import s from './NarrowNotice.module.css';

type NarrowNoticeProps = { readonly onClose: () => void };

/** Q13: below the narrow breakpoint the studio has nothing to edit on, so it says so and offers Close. */
function NarrowNotice({ onClose }: NarrowNoticeProps) {
  return (
    <div className={s.root}>
      <p className={s.text}>Needs a wider screen</p>
      <Button size="compact" onClick={onClose}>
        <CloseIcon size={14} />
        Close
      </Button>
    </div>
  );
}

export default NarrowNotice;

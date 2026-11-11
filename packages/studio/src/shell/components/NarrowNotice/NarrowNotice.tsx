import Button from '../../../../../../src/components/common/Button/Button';
import CloseIcon from '../../../../../../src/components/icons/CloseIcon/CloseIcon';
import PlayButton from '../PlayButton/PlayButton';
import { exitTakeover } from '../../../../../../src/state/takeover/takeoverActions';
import { useAppDispatch } from '../../../../../../src/store/hooks';
import s from './NarrowNotice.module.css';

/** Q13: below the narrow breakpoint the studio has nothing to edit on, so it says so; the preview still plays. */
function NarrowNotice() {
  const dispatch = useAppDispatch();
  return (
    <div className={s.root}>
      <p className={s.text}>Needs a wider screen</p>
      <div className={s.actions}>
        <PlayButton />
        <Button size="compact" onClick={() => dispatch(exitTakeover())}>
          <CloseIcon size={14} />
          Close
        </Button>
      </div>
    </div>
  );
}

export default NarrowNotice;

import { CLIP_OPTIONS } from './ClipPicker.constants';
import { clipRegistry } from '../../../../../../src/data/animation/clips/clipRegistry';
import { openStudio } from '../../../../../../src/state/studio/studioActions';
import { useAppDispatch } from '../../../../../../src/store/hooks';
import type { ClipId } from '../../../../../../src/@types/animation/ClipId';
import s from './ClipPicker.module.css';

type Props = { readonly clipId: ClipId };

/**
 * The studio's title, as a picker of every clip. Choosing one reopens the studio on it, the same
 * takeover a `#studio=` link starts; the left clip's unsaved edits go with it (Q28 keeps a draft
 * only for the clip it was made on).
 */
function ClipPicker({ clipId }: Props) {
  const dispatch = useAppDispatch();
  return (
    <span className={s.root}>
      <span className={s.name}>{clipRegistry[clipId].label}</span>
      <span className={s.caret} aria-hidden>
        ▾
      </span>
      <select
        className={s.select}
        aria-label="Clip"
        value={clipId}
        onChange={(e) => dispatch(openStudio(e.target.value as ClipId))}
      >
        {CLIP_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.text}
          </option>
        ))}
      </select>
    </span>
  );
}

export default ClipPicker;

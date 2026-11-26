import { CLIP_OPTIONS } from './ClipPicker.constants';
import { APP_CLIP_REGISTRY } from '../../../../../../src/compositions/appClips';
import type { ClipId } from '../../../../../../src/@types/animation/ClipId';
import s from './ClipPicker.module.css';

type ClipPickerProps = {
  readonly clipId: ClipId;
  readonly onPick: (clipId: ClipId) => void;
};

/**
 * The studio's title, as a picker of every clip. Choosing one reopens the studio on it, the same
 * takeover a `#studio=` link starts; the left clip's unsaved edits go with it (Q28 keeps a draft
 * only for the clip it was made on).
 */
function ClipPicker({ clipId, onPick }: ClipPickerProps) {
  return (
    <span className={s.root}>
      <span className={s.name}>{APP_CLIP_REGISTRY[clipId].label}</span>
      <span className={s.caret} aria-hidden>
        ▾
      </span>
      <select
        className={s.select}
        aria-label="Clip"
        value={clipId}
        onChange={(e) => onPick(e.target.value as ClipId)}
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

// src/components/AutoRotateToggle/AutoRotateToggle.tsx
/**
 * AutoRotateToggle — top-bar pill that toggles the engine's
 * autoRotate setting. Thin semantic wrapper over PillButton; owns
 * the dynamic icon swap (play ↔ pause), aria-pressed, and the
 * dynamic aria-label. Memoised because the parent re-renders on
 * every animation frame.
 */

import { memo, type ReactNode } from 'react';
import PillButton from '../common/PillButton/PillButton';
import PlayIcon from './PlayIcon';
import PauseIcon from './PauseIcon';

export type AutoRotateToggleProps = {
  readonly playing: boolean;
  readonly onToggle: () => void;
  readonly hidden?: boolean;
};

function AutoRotateToggle({ playing, onToggle, hidden = false }: AutoRotateToggleProps): ReactNode {
  const label = playing ? 'Pause camera auto-rotate' : 'Start camera auto-rotate';
  return (
    <PillButton
      onClick={onToggle}
      hidden={hidden}
      aria-label={label}
      aria-pressed={playing}
      tooltip={playing ? 'Pause rotation' : 'Auto-rotate'}
    >
      {playing ? <PauseIcon /> : <PlayIcon />}
    </PillButton>
  );
}

export default memo(AutoRotateToggle);

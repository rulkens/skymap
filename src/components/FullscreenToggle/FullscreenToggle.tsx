/**
 * FullscreenToggle — top-bar pill that enters or leaves browser full screen.
 * Thin semantic wrapper over PillButton: owns the aria-label, aria-pressed and
 * the icon swap. Which state it shows comes from the caller, which reads it from
 * the browser.
 */

import { memo, type ReactNode } from 'react';
import PillButton from '../common/PillButton/PillButton';
import FullscreenIcon from './FullscreenIcon';

export type FullscreenToggleProps = {
  readonly active: boolean;
  readonly onToggle: () => void;
  readonly hidden?: boolean;
};

function FullscreenToggle({ active, onToggle, hidden = false }: FullscreenToggleProps): ReactNode {
  const label = active ? 'Exit full screen' : 'Enter full screen';
  return (
    <PillButton
      onClick={onToggle}
      hidden={hidden}
      aria-label={label}
      aria-pressed={active}
      tooltip={active ? 'Exit full screen' : 'Full screen'}
    >
      <FullscreenIcon active={active} />
    </PillButton>
  );
}

export default memo(FullscreenToggle);

// src/components/Splash/AboutPill.tsx
/**
 * AboutPill — top-bar pill that reopens the splash dialog. Thin
 * semantic wrapper over the shared PillButton chrome; owns only
 * the aria-label and the InfoIcon child. Memoised because the
 * parent re-renders on every animation frame and this pill's
 * inputs change only on user action.
 */

import { memo, type ReactNode } from 'react';
import PillButton from '../common/PillButton/PillButton';
import InfoIcon from './InfoIcon';

export type AboutPillProps = {
  readonly onClick: () => void;
  readonly hidden?: boolean;
};

function AboutPill({ onClick, hidden = false }: AboutPillProps): ReactNode {
  return (
    <PillButton onClick={onClick} hidden={hidden} aria-label="About skymap">
      <InfoIcon />
    </PillButton>
  );
}

export default memo(AboutPill);

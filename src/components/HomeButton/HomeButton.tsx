// src/components/HomeButton/HomeButton.tsx
/**
 * HomeButton — top-bar pill that frames Earth (the viewer's starting point
 * is "home"). Thin semantic wrapper over the shared PillButton chrome; owns
 * only the aria-label and the HomeIcon child. The click dispatches a focus
 * on Earth through the standard selection channel, so this component
 * is pure UI. Memoised because the parent re-renders on every animation
 * frame and this pill's inputs change only on user action.
 */

import { memo, type ReactNode } from 'react';
import PillButton from '../common/PillButton/PillButton';
import HomeIcon from './HomeIcon';

export type HomeButtonProps = {
  readonly onClick: () => void;
  readonly hidden?: boolean;
};

function HomeButton({ onClick, hidden = false }: HomeButtonProps): ReactNode {
  return (
    <PillButton onClick={onClick} hidden={hidden} aria-label="Fly camera home" tooltip="Home view">
      <HomeIcon />
    </PillButton>
  );
}

export default memo(HomeButton);

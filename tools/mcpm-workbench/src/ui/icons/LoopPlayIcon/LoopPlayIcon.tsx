/** LoopPlayIcon: play inside a looping arrow, a run that keeps stepping. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../../../../../src/components/Icon/Icon';

function LoopPlayIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M20 12a8 8 0 1 1-2.35-5.65M20 4v4.5h-4.5" />
      <g fill="currentColor" stroke="none">
        <path d="M10 8.5v7l5.5-3.5z" />
      </g>
    </Icon>
  );
}

export default LoopPlayIcon;

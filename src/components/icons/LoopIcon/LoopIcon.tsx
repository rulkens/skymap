/** LoopIcon: two chasing arrows. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function LoopIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M3.75 11.25a6.25 6.25 0 0 0 11.25 2.5M16.25 8.75a6.25 6.25 0 0 0 -11.25 -2.5M3.75 2.5v3.75h3.75M16.25 17.5v-3.75h-3.75" />
      </g>
    </Icon>
  );
}

export default LoopIcon;

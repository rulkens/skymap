/** SwapViewsIcon: two opposing arrows. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function SwapViewsIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M2.5 6.25h13.75M12.5 2.5l3.75 3.75 -3.75 3.75M17.5 13.75H3.75M7.5 10l-3.75 3.75 3.75 3.75" />
      </g>
    </Icon>
  );
}

export default SwapViewsIcon;

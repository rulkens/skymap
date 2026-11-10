/** RedoIcon: a forward arrow over a loop. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function RedoIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M13.75 5l3.75 3.75 -3.75 3.75M17.5 8.75H7.5a5 5 0 0 0 0 10h3.75" />
      </g>
    </Icon>
  );
}

export default RedoIcon;

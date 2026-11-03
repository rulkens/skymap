/** PlayCircleIcon: solid play triangle in a ring. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function PlayCircleIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="10" />
      <g fill="currentColor" stroke="none">
        <path d="M9.75 7.5v9l6.75-4.5z" />
      </g>
    </Icon>
  );
}

export default PlayCircleIcon;

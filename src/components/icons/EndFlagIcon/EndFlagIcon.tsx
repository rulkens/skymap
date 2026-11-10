/** EndFlagIcon: a flag on a pole. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function EndFlagIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M4.375 2.5v15M4.375 3.125h11.25l-3.125 3.75 3.125 3.75h-11.25" />
      </g>
    </Icon>
  );
}

export default EndFlagIcon;

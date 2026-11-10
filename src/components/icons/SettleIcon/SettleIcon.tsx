/** SettleIcon: a ring around a smaller ring. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function SettleIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M10 3.125a6.875 6.875 0 1 1 0 13.75a6.875 6.875 0 1 1 0 -13.75M10 8.125a1.875 1.875 0 1 1 0 3.75a1.875 1.875 0 1 1 0 -3.75" />
      </g>
    </Icon>
  );
}

export default SettleIcon;

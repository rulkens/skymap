/** AimAlongIcon: an arrow along a bar. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function AimAlongIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M2.5 10h13.75M11.875 5.625L16.25 10l-4.375 4.375M2.5 3.75v12.5" />
      </g>
    </Icon>
  );
}

export default AimAlongIcon;

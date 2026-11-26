/** StrafeIcon: a sideways double arrow. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function StrafeIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M2.5 10h15M6.25 6.25L2.5 10l3.75 3.75M13.75 6.25l3.75 3.75 -3.75 3.75M10 3.75v2.5M10 13.75v2.5" />
      </g>
    </Icon>
  );
}

export default StrafeIcon;

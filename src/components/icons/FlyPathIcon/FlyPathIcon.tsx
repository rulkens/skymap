/** FlyPathIcon: a curved flight path with an arrowhead. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function FlyPathIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M1.875 16.25c3.75 -8.75 7.5 -1.25 11.25 -7.5l1.25 -2.5M11.25 5.625l3.75 -0.625 0.25 3.75M3.75 17.5a1.25 1.25 0 1 1 0 -0.125" />
      </g>
    </Icon>
  );
}

export default FlyPathIcon;

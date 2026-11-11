/** PointIcon: a square with tick marks. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function PointIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M6.25 6.25h7.5v7.5H6.25zM10 1.25v3.75M10 15v3.75M1.25 10h3.75M15 10h3.75" />
      </g>
    </Icon>
  );
}

export default PointIcon;

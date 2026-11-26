/** DistanceIcon: a double-headed vertical arrow. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function DistanceIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M10 1.875v16.25M5.625 6.25L10 1.875 14.375 6.25M5.625 13.75L10 18.125 14.375 13.75" />
      </g>
    </Icon>
  );
}

export default DistanceIcon;

/** LookIcon: a crosshair. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function LookIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M10 1.25v5M10 13.75v5M1.25 10h5M13.75 10h5M10 6.875a3.125 3.125 0 1 1 0 6.25a3.125 3.125 0 1 1 0 -6.25" />
      </g>
    </Icon>
  );
}

export default LookIcon;

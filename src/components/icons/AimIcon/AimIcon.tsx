/** AimIcon: an arrow into a bar. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function AimIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M2.5 10h10M8.75 5.625L13.125 10 8.75 14.375M16.875 3.125v13.75" />
      </g>
    </Icon>
  );
}

export default AimIcon;

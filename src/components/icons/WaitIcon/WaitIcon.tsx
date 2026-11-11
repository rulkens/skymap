/** WaitIcon: an hourglass. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function WaitIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M5 2.5h10M5 17.5h10M6.25 2.5c0 5 7.5 5 7.5 7.5s-7.5 2.5 -7.5 7.5M13.75 2.5c0 5 -7.5 5 -7.5 7.5" />
      </g>
    </Icon>
  );
}

export default WaitIcon;

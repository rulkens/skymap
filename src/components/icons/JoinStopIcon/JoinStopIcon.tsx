/** JoinStopIcon: two arches that meet on the floor. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function JoinStopIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M1.25 16.25Q5 3.75 9.375 16.25M10.625 16.25Q15 3.75 18.75 16.25" />
      </g>
    </Icon>
  );
}

export default JoinStopIcon;

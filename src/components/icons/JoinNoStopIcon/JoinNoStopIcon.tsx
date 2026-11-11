/** JoinNoStopIcon: two arches that run through each other. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function JoinNoStopIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M1.25 16.25Q5 2.5 10 8.75Q15 2.5 18.75 16.25" />
      </g>
    </Icon>
  );
}

export default JoinNoStopIcon;

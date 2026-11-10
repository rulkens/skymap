/** ParallelIcon: bars starting together. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function ParallelIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M2.5 2.5v15M5.625 5h11.25M5.625 10h11.25M5.625 15h11.25" />
      </g>
    </Icon>
  );
}

export default ParallelIcon;

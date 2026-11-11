/** WaypointIcon: a path passing a marker ring. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function WaypointIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M13.125 3.75a3.125 3.125 0 1 1 0 6.25a3.125 3.125 0 1 1 0 -6.25M1.875 18.125C3.75 11.25 7.5 11.875 10 13.75s5 3.125 8.125 1.25" />
      </g>
    </Icon>
  );
}

export default WaypointIcon;

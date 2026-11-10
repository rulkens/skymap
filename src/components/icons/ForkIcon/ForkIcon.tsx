/** ForkIcon: a branching line. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function ForkIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M5 2.5v15M5 11.25c0 -5 10 -3.75 10 -8.75" />
      </g>
    </Icon>
  );
}

export default ForkIcon;

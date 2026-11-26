/** FocusIcon: corner brackets around a dot. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function FocusIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M2.5 6.875V2.5h4.375M13.125 2.5H17.5v4.375M17.5 13.125V17.5h-4.375M6.875 17.5H2.5v-4.375M10 8.75v2.5" />
      </g>
    </Icon>
  );
}

export default FocusIcon;

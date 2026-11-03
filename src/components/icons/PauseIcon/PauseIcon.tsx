/** PauseIcon: two solid rounded bars. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function PauseIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g fill="currentColor" stroke="none">
        <rect x="5.625" y="4.125" width="5.25" height="15.75" rx="1.875" />
        <rect x="13.125" y="4.125" width="5.25" height="15.75" rx="1.875" />
      </g>
    </Icon>
  );
}

export default PauseIcon;

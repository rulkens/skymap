/** LiveIcon: a solid dot broadcasting two pairs of arcs. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function LiveIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g fill="currentColor" stroke="none">
        <circle cx="12" cy="12" r="3.125" />
      </g>
      <path d="M8.3 8.3a5.2 5.2 0 0 0 0 7.4M15.7 8.3a5.2 5.2 0 0 1 0 7.4M5.4 5.4a9.3 9.3 0 0 0 0 13.2M18.6 5.4a9.3 9.3 0 0 1 0 13.2" />
    </Icon>
  );
}

export default LiveIcon;

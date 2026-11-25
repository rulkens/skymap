/** MarqueeIcon: a dashed selection frame with its resize handle. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../../../../../src/components/Icon/Icon';

function MarqueeIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M4 7.5V4h3.5M10.5 4h3M16.5 4H20v3.5M20 10.5v3M4 10.5v3M4 16.5V20h3.5M10.5 20h3" />
      <g fill="currentColor" stroke="none">
        <rect x="16.25" y="16.25" width="5" height="5" rx="1" />
      </g>
    </Icon>
  );
}

export default MarqueeIcon;

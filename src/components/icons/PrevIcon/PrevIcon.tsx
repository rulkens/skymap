/** PrevIcon: skip back, a bar and a solid left-pointing triangle. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function PrevIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M6.5 5.5v13" />
      <g fill="currentColor" stroke="none">
        <path d="M19.375 5.8v12.4a.875.875 0 0 1-1.371.721l-9-6.2a.875.875 0 0 1 0-1.442l9-6.2A.875.875 0 0 1 19.375 5.8z" />
      </g>
    </Icon>
  );
}

export default PrevIcon;

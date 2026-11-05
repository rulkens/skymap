/** NextIcon: skip forward, a solid right-pointing triangle and a bar. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function NextIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M17.5 5.5v13" />
      <g fill="currentColor" stroke="none">
        <path d="M4.625 5.8v12.4a.875.875 0 0 0 1.371.721l9-6.2a.875.875 0 0 0 0-1.442l-9-6.2A.875.875 0 0 0 4.625 5.8z" />
      </g>
    </Icon>
  );
}

export default NextIcon;

/** PlayIcon: solid right-pointing triangle. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function PlayIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g fill="currentColor" stroke="none">
        <path d="M7.125 5.5v13a.875.875 0 0 0 1.336.744l10.5-6.5a.875.875 0 0 0 0-1.488l-10.5-6.5A.875.875 0 0 0 7.125 5.5z" />
      </g>
    </Icon>
  );
}

export default PlayIcon;

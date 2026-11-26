/** LockIcon: a padlock. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function LockIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M5 9.375h10v8.125H5zM6.875 9.375V6.25a3.125 3.125 0 0 1 6.25 0v3.125" />
      </g>
    </Icon>
  );
}

export default LockIcon;

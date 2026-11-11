/** EyeOffIcon: a struck-through eye. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function EyeOffIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M1.25 10s3.75 -6.25 8.75 -6.25 8.75 6.25 8.75 6.25 -3.75 6.25 -8.75 6.25 -8.75 -6.25 -8.75 -6.25zM3.125 16.875l13.75 -13.75" />
      </g>
    </Icon>
  );
}

export default EyeOffIcon;

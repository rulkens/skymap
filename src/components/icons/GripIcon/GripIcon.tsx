/** GripIcon: two vertical grab lines. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function GripIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M7.5 3.75v12.5M12.5 3.75v12.5" />
      </g>
    </Icon>
  );
}

export default GripIcon;

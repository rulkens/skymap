/** CubeIcon: a wireframe cube. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function CubeIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M1.875 5.625l8.125 -3.75 8.125 3.75v8.75l-8.125 3.75 -8.125 -3.75zM1.875 5.625L10 10l8.125 -4.375M10 10v8.125" />
      </g>
    </Icon>
  );
}

export default CubeIcon;

/** SpiralIcon: a core with a winding arm, a spiral galaxy. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../../../../../src/components/Icon/Icon';

function SpiralIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g fill="currentColor" stroke="none">
        <circle cx="12" cy="12" r="1.6" />
      </g>
      <path d="M15.5 12a3.5 3.5 0 0 1-7 0 6 6 0 0 1 12 0 8 8 0 0 1-8.5 8" />
    </Icon>
  );
}

export default SpiralIcon;

/** UndoIcon: a back arrow over a loop. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function UndoIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M6.25 5L2.5 8.75l3.75 3.75M2.5 8.75h10a5 5 0 0 1 0 10H8.75" />
      </g>
    </Icon>
  );
}

export default UndoIcon;

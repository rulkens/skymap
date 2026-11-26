/** PinIcon: a push pin. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function PinIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M10 11.875V18.75M6.25 2.5h7.5l-1.25 5 2.5 4.375H5L7.5 7.5z" />
      </g>
    </Icon>
  );
}

export default PinIcon;

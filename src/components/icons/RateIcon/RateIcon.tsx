/** RateIcon: a rising diagonal arrow. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function RateIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M2.5 16.875L16.25 5M16.25 5H10.625M16.25 5v5.625" />
      </g>
    </Icon>
  );
}

export default RateIcon;

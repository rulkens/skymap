/** RollIcon: a horizon line between two arrows turning about it. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function RollIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M5 12h14" />
      <path d="M20 8.5A8.5 8.5 0 0 0 5.5 6M4 15.5A8.5 8.5 0 0 0 18.5 18" />
      <path d="M5.5 2.5V6H9M18.5 21.5V18H15" />
    </Icon>
  );
}

export default RollIcon;

/** DatabaseIcon: a stack of disks, a catalog of rows. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../../../packages/shared/src/components/Icon/Icon';

function DatabaseIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
    </Icon>
  );
}

export default DatabaseIcon;

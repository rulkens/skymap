/** TimeIcon: clock face. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function TimeIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  );
}

export default TimeIcon;

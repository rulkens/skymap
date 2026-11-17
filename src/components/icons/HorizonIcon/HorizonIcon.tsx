/** HorizonIcon: the Sun half over a horizon line, with rays. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function HorizonIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M2.5 17.5h19M6.5 17.5a5.5 5.5 0 0 1 11 0M12 5v2.5M5.5 8.5l1.5 1.5M18.5 8.5L17 10" />
    </Icon>
  );
}

export default HorizonIcon;

/** MoonIcon: a crescent moon outline. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function MoonIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z" />
    </Icon>
  );
}

export default MoonIcon;

/** MagnetIcon: a horseshoe magnet. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function MagnetIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M5 2.5v7.5a5 5 0 0 0 10 0V2.5M5 6.25h2.5M12.5 6.25h2.5" />
      </g>
    </Icon>
  );
}

export default MagnetIcon;

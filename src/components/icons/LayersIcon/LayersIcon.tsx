/** LayersIcon: three stacked sheets. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function LayersIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M12 4 3.5 8.5 12 13l8.5-4.5zM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5" />
    </Icon>
  );
}

export default LayersIcon;

/** CubeIcon: an outlined cube, a voxel volume. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../../../packages/shared/src/components/Icon/Icon';

function CubeIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M12 3.5 19.5 7.75v8.5L12 20.5l-7.5-4.25v-8.5zM4.5 7.75 12 12l7.5-4.25M12 12v8.5" />
    </Icon>
  );
}

export default CubeIcon;

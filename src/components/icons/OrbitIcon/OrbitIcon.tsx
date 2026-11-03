/** OrbitIcon: a circling arrow around a centre dot. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function OrbitIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M19 12a7 7 0 1 1-2.1-5M19 4v3.5h-3.5" />
      <circle cx="12" cy="12" r="1.5" />
    </Icon>
  );
}

export default OrbitIcon;

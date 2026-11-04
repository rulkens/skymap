/** PlanetIcon: a globe crossed by a tilted ring. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function PlanetIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="5" />
      <path d="M20.2 8.6c1.2 1.4 1.3 2.5.6 3.2-1.6 1.6-6.3.9-10.4-1.6M3.8 15.4c-1.2-1.4-1.3-2.5-.6-3.2 1-1 3.2-1.2 5.6-.6" />
    </Icon>
  );
}

export default PlanetIcon;

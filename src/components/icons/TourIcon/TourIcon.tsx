/** TourIcon: a winding route between two stops. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function TourIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <circle cx="5.5" cy="18" r="2" />
      <circle cx="18.5" cy="6" r="2" />
      <path d="M7.5 18H16a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8.5" />
    </Icon>
  );
}

export default TourIcon;

/** RayStepsIcon: evenly spaced samples along a ray, the march. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../../../../../src/components/Icon/Icon';

function RayStepsIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M15 12h6M17 8l4 4-4 4" />
      <g fill="currentColor" stroke="none">
        <circle cx="3.5" cy="12" r="2" />
        <circle cx="10" cy="12" r="2" />
      </g>
    </Icon>
  );
}

export default RayStepsIcon;

/** LabelsIcon: a price tag. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function LabelsIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M3.5 12.5v-7a2 2 0 0 1 2-2h7l8 8a1.6 1.6 0 0 1 0 2.3l-6.7 6.7a1.6 1.6 0 0 1-2.3 0z" />
      <circle cx="8" cy="8" r="1.4" />
    </Icon>
  );
}

export default LabelsIcon;

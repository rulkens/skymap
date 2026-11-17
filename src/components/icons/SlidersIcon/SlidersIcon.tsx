/** SlidersIcon: two slider tracks with their knobs. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function SlidersIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M4 7h8M16 7h4M4 17h4M12 17h8" />
      <circle cx="14" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </Icon>
  );
}

export default SlidersIcon;

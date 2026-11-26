/** ParticlesIcon: three dots trailing their headings, moving agents. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function ParticlesIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g fill="currentColor" stroke="none">
        <circle cx="8.5" cy="6" r="2.4" />
        <circle cx="18.5" cy="11" r="2.4" />
        <circle cx="10.5" cy="18" r="2.4" />
      </g>
      <path d="M4.7 7.6 2 8.9M14.7 12.6 12 13.9M6.7 19.6 4 20.9" />
    </Icon>
  );
}

export default ParticlesIcon;

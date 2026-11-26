/** FadeIcon: a half-filled disc. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function FadeIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M10 2.5a7.5 7.5 0 1 0 0 15zM10 2.5a7.5 7.5 0 0 1 0 15" />
      </g>
    </Icon>
  );
}

export default FadeIcon;

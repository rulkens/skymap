/** MinusIcon: a horizontal bar. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function MinusIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M6 12h12" />
    </Icon>
  );
}

export default MinusIcon;

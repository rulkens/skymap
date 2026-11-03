/** CloseIcon: a cross. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function CloseIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Icon>
  );
}

export default CloseIcon;

/** ExhibitIcon: a sparkle in a picture frame. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function ExhibitIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M3.5 6.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
      <path d="M12 8.5c.35 2.1 1.4 3.15 3.5 3.5-2.1.35-3.15 1.4-3.5 3.5-.35-2.1-1.4-3.15-3.5-3.5 2.1-.35 3.15-1.4 3.5-3.5z" />
    </Icon>
  );
}

export default ExhibitIcon;

/** ClipIcon: video camera. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function ClipIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M3.5 8.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2zM15.5 10.5l5-3v9l-5-3z" />
    </Icon>
  );
}

export default ClipIcon;

/** BounceIcon: a ray reflecting off a surface, a traced light path. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function BounceIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M3 19.5h18M4 4.5l6 15L16 8M12.8 9.7 16 8l.5 3.6" />
    </Icon>
  );
}

export default BounceIcon;

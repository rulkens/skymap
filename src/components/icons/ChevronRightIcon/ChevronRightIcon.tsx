/** ChevronRightIcon: a right-pointing chevron. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function ChevronRightIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M9.5 6l6 6-6 6" />
    </Icon>
  );
}

export default ChevronRightIcon;

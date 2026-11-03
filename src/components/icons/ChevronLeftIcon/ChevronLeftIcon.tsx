/** ChevronLeftIcon: a left-pointing chevron. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function ChevronLeftIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M14.5 6l-6 6 6 6" />
    </Icon>
  );
}

export default ChevronLeftIcon;

/** SearchIcon: magnifying glass. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function SearchIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 20.5 20.5" />
    </Icon>
  );
}

export default SearchIcon;

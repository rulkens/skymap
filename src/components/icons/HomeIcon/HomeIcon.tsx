/** HomeIcon: house outline. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function HomeIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M4 11.5 12 4l8 7.5M6 10v9.5h12V10M10 19.5v-5h4v5" />
    </Icon>
  );
}

export default HomeIcon;

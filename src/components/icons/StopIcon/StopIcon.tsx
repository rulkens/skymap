/** StopIcon: solid rounded square, the media stop glyph. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function StopIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g fill="currentColor" stroke="none">
        <rect x="5.125" y="5.125" width="13.75" height="13.75" rx="2.375" />
      </g>
    </Icon>
  );
}

export default StopIcon;

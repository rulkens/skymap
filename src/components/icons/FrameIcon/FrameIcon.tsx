/** FrameIcon: a ground line and a framing diagonal. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function FrameIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M2.5 14.375h15M5.625 8.125l8.75 -3.75M10 14.375V10" />
      </g>
    </Icon>
  );
}

export default FrameIcon;

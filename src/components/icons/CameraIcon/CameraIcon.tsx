/** CameraIcon: a video camera. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function CameraIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M1.875 5.625h11.25v8.75h-11.25zM13.125 8.75l5 -3.125v8.75l-5 -3.125" />
      </g>
    </Icon>
  );
}

export default CameraIcon;

/** OscillateIcon: a sine wave. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function OscillateIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M1.25 10c2.25 -6.25 4.5 -6.25 6.75 0s4.5 6.25 6.75 0 2.75 -3.75 4 -3.75" />
      </g>
    </Icon>
  );
}

export default OscillateIcon;

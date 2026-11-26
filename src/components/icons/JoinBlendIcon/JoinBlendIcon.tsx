/** JoinBlendIcon: two crossing eased curves. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function JoinBlendIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M1.25 5C7.5 5 12.5 15 18.75 15M1.25 15C7.5 15 12.5 5 18.75 5" />
      </g>
    </Icon>
  );
}

export default JoinBlendIcon;

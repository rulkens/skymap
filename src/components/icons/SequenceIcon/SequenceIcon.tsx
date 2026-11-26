/** SequenceIcon: stepped bars, one after another. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function SequenceIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <g transform="translate(2 2)">
        <path d="M1.875 4.375h6.25M6.25 10h6.25M10.625 15.625h7.5" />
      </g>
    </Icon>
  );
}

export default SequenceIcon;

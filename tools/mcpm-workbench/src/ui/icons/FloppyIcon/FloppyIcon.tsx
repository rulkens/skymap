/** FloppyIcon: a floppy disk, the save glyph. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../../../../../src/components/Icon/Icon';

function FloppyIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M4.5 4.5h11l4 4v11h-15zM8 4.5v4.5h6.5V4.5M8 19.5v-5.5h8v5.5" />
    </Icon>
  );
}

export default FloppyIcon;

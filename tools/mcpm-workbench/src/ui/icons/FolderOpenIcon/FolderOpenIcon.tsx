/** FolderOpenIcon: an open folder, the load glyph. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../../../../../src/components/Icon/Icon';

function FolderOpenIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M3.5 18.5v-13h5.5l2 2h7.5v3M3.5 18.5l3-8h15l-3 8z" />
    </Icon>
  );
}

export default FolderOpenIcon;

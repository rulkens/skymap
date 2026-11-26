/** ImportIcon: an arrow into a tray, the bring-this-file-in glyph. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function ImportIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4 14.5v5h16v-5" />
    </Icon>
  );
}

export default ImportIcon;

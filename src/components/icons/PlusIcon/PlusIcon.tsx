/** PlusIcon: a plus sign. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function PlusIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M12 6v12M6 12h12" />
    </Icon>
  );
}

export default PlusIcon;

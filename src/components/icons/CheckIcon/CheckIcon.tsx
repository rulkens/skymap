/** CheckIcon: a tick, for a step or a task that is done. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function CheckIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M5 12.5 10 17.5 19 7" />
    </Icon>
  );
}

export default CheckIcon;

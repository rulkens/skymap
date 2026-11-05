/** PhonePlusIcon: a phone with a plus beside it. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function PhonePlusIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M14.5 13v5.5a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2H10M8.5 17.5h2M18 3.5v7M14.5 7h7" />
    </Icon>
  );
}

export default PhonePlusIcon;

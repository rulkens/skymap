/** CalendarIcon: a calendar page with two binding rings. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function CalendarIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8.5 3v4M15.5 3v4" />
    </Icon>
  );
}

export default CalendarIcon;

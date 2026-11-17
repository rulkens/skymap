/** AlertIcon: an exclamation mark in a circle, beside a problem that needs the person. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function AlertIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.5" />
      <g fill="currentColor" stroke="none">
        <circle cx="12" cy="16.5" r="1.275" />
      </g>
    </Icon>
  );
}

export default AlertIcon;

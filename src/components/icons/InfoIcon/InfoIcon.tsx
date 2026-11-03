/** InfoIcon: circled question mark. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function InfoIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.75 9.5Q9.75 7.25 12 7.25T14.25 9.5Q14.25 11 12 11.75v1.5" />
      <g fill="currentColor" stroke="none">
        <circle cx="12" cy="16.75" r="1.275" />
      </g>
    </Icon>
  );
}

export default InfoIcon;

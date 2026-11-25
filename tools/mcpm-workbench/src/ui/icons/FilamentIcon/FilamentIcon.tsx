/** FilamentIcon: a curved trail between two points, the paths the trace records. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../../../../../src/components/Icon/Icon';

function FilamentIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="6" r="2" />
      <path d="M7 18h1.5c4.5 0 2.5-12 7-12H17" />
    </Icon>
  );
}

export default FilamentIcon;

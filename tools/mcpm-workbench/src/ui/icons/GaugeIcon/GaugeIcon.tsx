/** GaugeIcon: a dial with its needle, a reading at a glance. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../../../../../src/components/Icon/Icon';

function GaugeIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M5 18a8 8 0 1 1 14 0M12 14l3.5-4" />
    </Icon>
  );
}

export default GaugeIcon;

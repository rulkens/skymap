/** HistogramIcon: bars of unequal height on a baseline. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../../../../../src/components/Icon/Icon';

function HistogramIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M3.5 20h17M7 20v-6M12 20V5M17 20v-9" />
    </Icon>
  );
}

export default HistogramIcon;

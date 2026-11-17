/** SparkleIcon: four-pointed star outline. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function SparkleIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M12 3c.8 5.2 3.8 8.2 9 9-5.2.8-8.2 3.8-9 9-.8-5.2-3.8-8.2-9-9 5.2-.8 8.2-3.8 9-9z" />
    </Icon>
  );
}

export default SparkleIcon;

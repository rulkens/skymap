/**
 * FullscreenIcon: four corner brackets, pointing outward to enter full screen and
 * inward to leave it, so the state never rests on colour alone.
 */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

export type FullscreenIconProps = Pick<IconProps, 'size'> & {
  readonly active: boolean;
};

function FullscreenIcon({ size, active }: FullscreenIconProps): ReactNode {
  return (
    <Icon size={size}>
      <path
        d={
          active
            ? 'M9 3v6H3M21 9h-6V3M15 21v-6h6M3 15h6v6'
            : 'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6'
        }
      />
    </Icon>
  );
}

export default FullscreenIcon;

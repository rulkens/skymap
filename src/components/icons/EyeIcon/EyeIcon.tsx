/** EyeIcon: an open eye, struck through while what it toggles is hidden. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

export type EyeIconProps = Pick<IconProps, 'size'> & {
  readonly struck: boolean;
};

function EyeIcon({ size, struck }: EyeIconProps): ReactNode {
  return (
    <Icon size={size}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.75" />
      {struck && <path d="M4 20 20 4" />}
    </Icon>
  );
}

export default EyeIcon;

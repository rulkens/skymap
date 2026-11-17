/** ExternalLinkIcon: arrow out to the upper right, trailing a link that leaves the app. */

import type { ReactNode } from 'react';
import Icon, { type IconProps } from '../../Icon/Icon';

function ExternalLinkIcon({ size }: Pick<IconProps, 'size'>): ReactNode {
  return (
    <Icon size={size}>
      <path d="M7 17 17 7M9 7h8v8" />
    </Icon>
  );
}

export default ExternalLinkIcon;

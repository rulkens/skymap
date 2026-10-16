/*
 * ObjLink — a link dressed as the site's one control (the ring, styles/ring.module.css).
 * A drawing of where it goes takes the marker's place: the destination page's
 * icon or the mark of a link that leaves (utils/linkIcon.ts), unless `icon`
 * names another; a jump within the page keeps the plain marker. `hang` puts the
 * marker in the margin so the label starts at the text edge.
 */
import type { ComponentPropsWithoutRef } from 'react';

import type { IconName } from '../../@types/IconName';
import { cx } from '../../utils/cx.ts';
import { linkIcon } from '../../utils/linkIcon.ts';
import Icon from '../Icon/Icon.tsx';
import styles from './ObjLink.module.css';

export type ObjLinkProps = ComponentPropsWithoutRef<'a'> & {
  href: string;
  size?: 'small' | 'default' | 'big';
  icon?: IconName;
  hang?: boolean;
};

function ObjLink({
  size = 'default',
  icon,
  hang = false,
  className,
  children,
  ...rest
}: ObjLinkProps) {
  const drawing = icon ?? linkIcon(rest.href, import.meta.env.BASE_URL);
  return (
    <a
      className={cx(
        styles.root,
        size !== 'default' && styles[size],
        hang && styles.hang,
        // The global names too, while an .astro host's `:global(.ring)` rule still selects a link.
        'ring',
        size !== 'default' && size,
        hang && 'hang',
        className,
      )}
      {...rest}
    >
      {drawing && <Icon name={drawing} />}
      {children}
    </a>
  );
}

export default ObjLink;

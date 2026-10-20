/*
 * OpenApp — the launch control, and the site's one button: every other control
 * is the ring (ObjLink), so the one solid block on a page is the way into the
 * app. Same label, icon and shape wherever it appears; `small` is the bar's
 * size. A link in fact, since it goes to another address.
 */
import type { ComponentPropsWithoutRef } from 'react';

import { OPEN_APP_LABEL, appLink } from '../../data/appLink.ts';
import { cx } from '../../utils/cx.ts';
import Icon from '../Icon/Icon.tsx';
import styles from './OpenApp.module.css';

type OpenAppProps = Omit<ComponentPropsWithoutRef<'a'>, 'href'> & { size?: 'small' | 'default' };

function OpenApp({ size = 'default', className, ...rest }: OpenAppProps) {
  return (
    <a
      className={cx(styles.root, size === 'small' && styles.small, className)}
      href={appLink()}
      {...rest}
    >
      <Icon name="app" />
      {OPEN_APP_LABEL}
    </a>
  );
}

export default OpenApp;

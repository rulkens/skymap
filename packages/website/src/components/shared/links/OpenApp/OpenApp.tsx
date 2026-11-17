/*
 * OpenApp — the launch control, and the site's one button: every other control
 * is the ring (ObjLink), so the one solid block on a page is the way into the
 * app. Same label, icon and shape wherever it appears; `small` is the bar's
 * size. The one AppLink with no view (tests/packages/website/appLinks.test.ts).
 */
import { OPEN_APP_LABEL } from '../../../../data/appLink.ts';
import { cx } from '../../../../utils/cx.ts';
import AppLink from '../AppLink/AppLink.tsx';
import type { AppLinkProps } from '../AppLink/AppLink.tsx';
import Icon from '../Icon/Icon.tsx';
import styles from './OpenApp.module.css';

type OpenAppProps = Omit<AppLinkProps, 'view' | 'query'> & { size?: 'small' | 'default' };

function OpenApp({ size = 'default', className, ...rest }: OpenAppProps) {
  return (
    <AppLink className={cx(styles.root, size === 'small' && styles.small, className)} {...rest}>
      <Icon name="app" />
      {OPEN_APP_LABEL}
    </AppLink>
  );
}

export default OpenApp;

/*
 * Nav — sticky on every page, so the launch control is never more than a
 * glance away. Its black ground is a separate layer below the bar, and every
 * section passes under it. On a page with a hero (`hero`) the ground lies above
 * the hero and is clear (`--nav-ground`, set by the Flight), so the bar floats
 * on the picture, and it comes back before the hero lets go, so nothing of the
 * hero scrolls up through the bar's labels. Without script the ground is
 * simply there. The phone's menu is the one interactive part, passed in as
 * `menu` (NavMenu, an island): a static component cannot hold one itself.
 */
import type { ReactNode } from 'react';

import { NAV_ITEMS } from '../../data/nav.ts';
import { cx } from '../../utils/cx.ts';
import { sitePath } from '../../utils/sitePath.ts';
import ObjLink from '../ObjLink/ObjLink.tsx';
import OpenApp from '../OpenApp/OpenApp.tsx';
import styles from './Nav.module.css';

type NavProps = { path: string; hero?: boolean; menu?: ReactNode };

function Nav({ path, hero = false, menu }: NavProps) {
  return (
    <>
      <div className={cx(styles.ground, hero && styles.hero)} aria-hidden="true" />
      <header className={cx(styles.root, hero && styles.hero)}>
        <a className={styles.mark} href={sitePath('/')}>
          skymap
        </a>

        <nav aria-label="Main">
          <ul className={styles.links}>
            {NAV_ITEMS.map((item) => (
              <li key={item.path}>
                <ObjLink
                  size="small"
                  icon={item.icon}
                  href={sitePath(item.path)}
                  // The page you are on keeps the ring around its icon, like the app's selected object.
                  aria-current={path === sitePath(item.path) ? 'page' : undefined}
                >
                  {item.label}
                </ObjLink>
              </li>
            ))}
          </ul>
          {menu}
        </nav>

        <OpenApp size="small" className={styles.open} />
      </header>
    </>
  );
}

export default Nav;

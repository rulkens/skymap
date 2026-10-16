/*
 * NavMenu — the phone's version of the bar's links: the same items behind a
 * disclosure. A disclosure that stays open over the page is a trap on a
 * phone, so Escape and a tap outside close it. Styled by Nav.module.css, since
 * the bar's own rules reach it.
 */
import { useEffect, useRef } from 'react';

import { NAV_ITEMS } from '../../data/nav.ts';
import { sitePath } from '../../utils/sitePath.ts';
import Icon from '../Icon/Icon.tsx';
import ObjLink from '../ObjLink/ObjLink.tsx';
import styles from './Nav.module.css';

type NavMenuProps = { path: string };

function NavMenu({ path }: NavMenuProps) {
  const menu = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = menu.current!;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !details.open) return;
      details.open = false;
      details.querySelector('summary')?.focus();
    };
    const onClick = (event: MouseEvent) => {
      if (details.open && !details.contains(event.target as Node)) details.open = false;
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <details ref={menu} className={styles.menu} data-menu>
      <summary className={styles.toggle}>
        <Icon name="menu" />
        Menu
      </summary>
      <ul className={styles.list}>
        {NAV_ITEMS.map((item) => (
          <li key={item.path}>
            <ObjLink
              className={styles.item}
              icon={item.icon}
              href={sitePath(item.path)}
              aria-current={path === sitePath(item.path) ? 'page' : undefined}
            >
              {item.label}
            </ObjLink>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default NavMenu;

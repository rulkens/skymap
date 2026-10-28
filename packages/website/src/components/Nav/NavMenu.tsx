/*
 * NavMenu — the phone's version of the bar's links: the same items in a popover.
 * A list that stays open over the page is a trap on a phone; the browser's own
 * popover closes on Escape and on a tap outside and hands focus back to the
 * button, so the menu needs no script. Styled by Nav.module.css.
 */
import { NAV_ITEMS } from '../../data/nav.ts';
import { sitePath } from '../../utils/sitePath.ts';
import Icon from '../Icon/Icon.tsx';
import ObjLink from '../ObjLink/ObjLink.tsx';
import styles from './Nav.module.css';

const LIST_ID = 'site-menu';

type NavMenuProps = { path: string };

function NavMenu({ path }: NavMenuProps) {
  return (
    <div className={styles.menu}>
      <button type="button" className={styles.toggle} popoverTarget={LIST_ID}>
        <Icon name="menu" />
        Menu
      </button>
      <ul id={LIST_ID} popover="auto" className={styles.list}>
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
    </div>
  );
}

export default NavMenu;

/*
 * Footer — the end of every page, set as a place rather than a strip: the
 * name, what Skymap is and the way in; every page under three headings; then
 * the small print. Its ground is the app's widest view, the sphere at the edge
 * of the observable universe, of which only the top rises into the page, so
 * each page ends at the edge of the map. The picture carries its label like
 * any other on the site. The page's last sentence, which counts the light's
 * distance, is the one interactive part, passed in as `light` (LightLine, an island).
 */
import type { ReactNode } from 'react';

import pkg from '../../../../../package.json';
import { FOOTER_GROUPS } from '../../data/nav.ts';
import { MAKER_NAME, REPO_BLOB, REPO_URL } from '../../data/siteIdentity.ts';
import { sitePath } from '../../utils/sitePath.ts';
import ObjLink from '../ObjLink/ObjLink.tsx';
import OpenApp from '../OpenApp/OpenApp.tsx';
import Shot from '../Shot/Shot.tsx';
import ShotCaption from '../ShotCaption/ShotCaption.tsx';
import styles from './Footer.module.css';

type FooterProps = { path: string; light?: ReactNode };

const GROUND = 'lesson-universe';
const groups = FOOTER_GROUPS.map((group) => ({
  heading: group.heading,
  links: group.items.map((item) => ({
    label: item.label,
    icon: item.icon,
    href: sitePath(item.path),
  })),
}));
// The repository is the one link here that leaves the site, so it is not a row of the site's own pages.
groups.at(-1)!.links.push({ label: 'GitHub', icon: 'code', href: REPO_URL });

function Footer({ path, light }: FooterProps) {
  return (
    <footer className={styles.root}>
      <div className={styles.ground} aria-hidden="true">
        <Shot id={GROUND} sizes="clamp(64rem, 75vw, 80rem)" alt="" />
      </div>

      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.brand}>
            <a className={styles.mark} href={sitePath('/')}>
              skymap
            </a>
            <p className={styles.say}>
              A free, open-source web app that draws the mapped universe in three dimensions at true
              scale.
            </p>
            <OpenApp size="small" />
          </div>

          <nav className={styles.groups} aria-label="Footer">
            {groups.map((group) => (
              <div key={group.heading}>
                <p className={styles.heading}>{group.heading}</p>
                <ul>
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <ObjLink
                        className={styles.link}
                        size="small"
                        icon={link.icon}
                        href={link.href}
                        aria-current={path === link.href ? 'page' : undefined}
                      >
                        {link.label}
                      </ObjLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <ShotCaption id={GROUND} />

        <div className={styles.end}>
          {light}
          <p className={styles.fine}>
            {`Skymap is made by ${MAKER_NAME}. The code is open source under the `}
            <a href={`${REPO_BLOB}/LICENSE`}>{`${pkg.license} licence`}</a>
            {`. Version ${pkg.version}.`}
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;

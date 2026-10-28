/*
 * BaseLayout — what every page has inside its body: the skip link, the top
 * bar, the page in `main` and the footer. The document around it (head, fonts,
 * JSON-LD) is layouts/Base.astro, which a framework component cannot own.
 * `menu` and `light` are the two islands of the bar and the footer, passed in
 * from there because only an .astro file can make one. `skipTo` is the id the
 * "Skip to content" link goes to, where a layout has its own contents before the text.
 */
import type { ReactNode } from 'react';

import Footer from '../../components/Footer/Footer.tsx';
import Nav from '../../components/Nav/Nav.tsx';
import styles from './BaseLayout.module.css';

type BaseLayoutProps = {
  path: string;
  skipTo?: string;
  hero?: boolean;
  menu?: ReactNode;
  light?: ReactNode;
  children?: ReactNode;
};

function BaseLayout({
  path,
  skipTo = 'main',
  hero = false,
  menu,
  light,
  children,
}: BaseLayoutProps) {
  return (
    <>
      <a className={styles.skip} href={`#${skipTo}`}>
        Skip to content
      </a>
      <Nav path={path} hero={hero} menu={menu} />
      <main id="main">{children}</main>
      <Footer path={path} light={light} />
    </>
  );
}

export default BaseLayout;

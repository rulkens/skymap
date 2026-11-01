/* Links — `<Links>` on a docs page: view links side by side under the text they follow, wrapping to more lines as the column needs. */
import type { ReactNode } from 'react';

import styles from './Links.module.css';

type LinksProps = { children?: ReactNode };

function Links({ children }: LinksProps) {
  return <p className={styles.root}>{children}</p>;
}

export default Links;

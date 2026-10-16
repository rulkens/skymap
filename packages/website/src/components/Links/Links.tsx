/* Links — `<Links>` on a docs page: view links side by side under the text they follow, wrapping to more lines as the column needs. */
import type { ReactNode } from 'react';

import { cx } from '../../utils/cx.ts';
import styles from './Links.module.css';

type LinksProps = { children?: ReactNode };

/* `link-row` too, the global name: DocBody tells a row from a lone ring by it until its rules are rewritten. */
function Links({ children }: LinksProps) {
  return <p className={cx(styles.root, 'link-row')}>{children}</p>;
}

export default Links;

/* ObjLink's ring as a class, for the anchor ObjLink does not render itself: ViewLink's AppLink. */
import { cx } from '../../../../utils/cx.ts';
import type { ObjLinkProps } from './ObjLink.tsx';
import styles from './ObjLink.module.css';

export function objLinkClass({
  size = 'default',
  hang = false,
  className,
}: Pick<ObjLinkProps, 'size' | 'hang' | 'className'>): string {
  return cx(styles.root, size !== 'default' && styles[size], hang && styles.hang, className);
}

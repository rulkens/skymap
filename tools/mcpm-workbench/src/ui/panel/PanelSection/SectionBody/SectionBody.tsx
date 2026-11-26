/**
 * SectionBody — a PanelSection's foldable body: grows in on mount, folds up before it
 * unmounts (inert meanwhile, so focus cannot land in a closing body), and slides to a
 * new height when `contentKey` changes.
 */
import { useRef, type ReactNode } from 'react';
import { useContentKeySlide } from './useContentKeySlide';
import { useFoldUnmount } from './useFoldUnmount';
import styles from './SectionBody.module.css';

export type SectionBodyProps = {
  readonly open: boolean;
  readonly contentKey?: string;
  readonly children: ReactNode;
};

function SectionBody({ open, contentKey, children }: SectionBodyProps): ReactNode {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [mounted, closing] = useFoldUnmount(open, bodyRef);
  useContentKeySlide(bodyRef, contentKey);
  if (!mounted) return null;
  return (
    <div ref={bodyRef} className={styles.root} data-closing={closing || undefined} inert={closing}>
      <div className={styles.content}>{children}</div>
    </div>
  );
}

export default SectionBody;

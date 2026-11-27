/** LoadFooter — the load dialog's footer: a slow read's progress line, Cancel and Load. */
import type { ReactNode, Ref } from 'react';
import Button from '../../../../../../../packages/shared/src/components/common/Button/Button';
import ImportIcon from '../../../../../../../src/components/icons/ImportIcon/ImportIcon';
import controls from '../dialogControl.module.css';
import styles from './LoadFooter.module.css';

export type LoadFooterProps = {
  /** The file being read while the read is slow; null shows no progress line. */
  readonly readingName: string | null;
  readonly loadable: boolean;
  /** A parse is on its way, so Load is about to change. */
  readonly busy: boolean;
  /** Load reads "Load anyway": the parse raised a warning. */
  readonly warned: boolean;
  readonly loadRef: Ref<HTMLButtonElement>;
  readonly onCancel: () => void;
};

function LoadFooter({
  readingName,
  loadable,
  busy,
  warned,
  loadRef,
  onCancel,
}: LoadFooterProps): ReactNode {
  return (
    <footer className={styles.root}>
      <p role="status" className={styles.reading}>
        {readingName ? `Reading ${readingName}…` : ''}
      </p>
      <Button className={controls.button} onClick={onCancel}>
        Cancel
      </Button>
      <Button
        ref={loadRef}
        type="submit"
        variant="primary"
        className={styles.load}
        disabled={!loadable}
        aria-busy={busy}
      >
        <ImportIcon size={12} />
        {/* Both labels share one cell, so the button keeps its width. */}
        <span className={styles.loadLabels}>
          <span data-shown={!warned} aria-hidden={warned}>
            Load catalog
          </span>
          <span data-shown={warned} aria-hidden={!warned}>
            Load anyway
          </span>
        </span>
      </Button>
    </footer>
  );
}

export default LoadFooter;

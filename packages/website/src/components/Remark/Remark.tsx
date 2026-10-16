/*
 * Remark — one true sentence set apart from the page's argument, at most one
 * a page and never in its opening section. `text` is the sentence as it stands
 * without script; `live` names a figure worked out in the reader's browser,
 * which replaces it when the line scrolls into view (remarkLines.client.ts).
 */
import { cx } from '../../utils/cx.ts';
import styles from './Remark.module.css';

export type RemarkProps = { text: string; live?: 'dome-turn' | 'files-fetched' };

function Remark({ text, live }: RemarkProps) {
  return (
    <p className={cx(styles.root, live && styles.live)} data-remark={live}>
      {text}
    </p>
  );
}

export default Remark;

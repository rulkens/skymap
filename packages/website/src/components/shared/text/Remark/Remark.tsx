/*
 * Remark — one true sentence set apart from the page's argument, at most one
 * a page and never in its opening section. `text` is the sentence as it stands
 * without script; `live` names a figure worked out in the reader's browser,
 * which replaces it when the line scrolls into view (remarkLines.client.ts).
 * `statements` stands it on a Claims list's statement edge, for a section that ends on one.
 */
import { cx } from '../../../../utils/cx.ts';
import styles from './Remark.module.css';

export type RemarkProps = {
  text: string;
  live?: 'dome-turn' | 'files-fetched';
  statements?: boolean;
};

function Remark({ text, live, statements = false }: RemarkProps) {
  return (
    <p
      className={cx(styles.root, live && styles.live, statements && styles.statements)}
      data-remark={live}
    >
      {text}
    </p>
  );
}

export default Remark;

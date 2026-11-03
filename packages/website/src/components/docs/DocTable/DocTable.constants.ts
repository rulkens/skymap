import type { DocTableCols } from '../../../@types/DocTableCols';
import styles from './DocTable.module.css';

// Ends every cell: the search index joins the words of neighbouring cells where nothing stands between them.
export const SPACE = ' ';

export const LAYOUT: Record<DocTableCols, string> = {
  '2 4': styles.twoFour!,
  '3 3': styles.threeThree!,
  '2 2 2': styles.twoTwoTwo!,
  '4 2': styles.fourTwo!,
  detail: styles.detail!,
  stack: styles.stack!,
  over: styles.over!,
};

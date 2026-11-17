import type { LABEL_STYLES } from '../../data/labels/labelStyles';

/** A row of `LABEL_STYLES`; a record carries the row's index. */
export type LabelStyleId = keyof typeof LABEL_STYLES;

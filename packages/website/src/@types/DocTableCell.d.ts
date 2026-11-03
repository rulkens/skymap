import type { DocCell } from './DocCell';

/** A cell of a DocTable: one fed from data, or a Markdown table's, which arrives as the HTML inside it. */
export type DocTableCell = DocCell | { html: string };

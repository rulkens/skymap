/**
 * How a docs table lays its cells on the text column's six grid columns
 * (seven on a mid-width window, where the widest cell takes the seventh).
 * `2 4`, `3 3`, `2 2 2` and `4 2` are true columns. `detail` and `stack` set the
 * first cell in two columns as the row's name and the rest one under another
 * in the other four, each led by its column's heading; `detail` leaves the
 * second cell, the description, without one. `over` sets the first cell over
 * the others at every width; a table whose first cells are `codes` gets it,
 * because a command's name is not broken and can be wider than two columns.
 */
export type DocTableCols = '2 4' | '3 3' | '2 2 2' | '4 2' | 'detail' | 'stack' | 'over';

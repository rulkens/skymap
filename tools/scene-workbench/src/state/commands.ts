/** One-shot commands with no state of their own — no reducer handles them
 *  (the `mcpm-workbench` idiom). Nothing reads `splatOrderWritten`'s asset id
 *  back: the dispatch itself trips the viewport's dirty flag into a redraw. */
import { createAction } from '@reduxjs/toolkit';

export const splatOrderWritten = createAction<string>('splatOrderWritten');

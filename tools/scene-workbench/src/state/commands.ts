import { createAction } from '@reduxjs/toolkit';

/** Nothing reads the payload back: the dispatch itself trips the viewport's dirty flag. */
export const splatOrderWritten = createAction<string>('splatOrderWritten');

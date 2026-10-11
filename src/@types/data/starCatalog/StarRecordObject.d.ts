/** Where a catalog ordinal's record lives: the index (`chunk` null) or a chunk, at an object-local record index. */
export type StarRecordObject = { readonly chunk: number | null; readonly local: number };

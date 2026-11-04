/** A file's new content; `from === to` when it was only edited, not moved. */
export type FileEdit = { readonly from: string; readonly to: string; readonly text: string };

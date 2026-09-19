/** One BINTABLE column's identity and its byte range within a row. */
export type FitsColumn = {
  /** TTYPEn, verbatim (e.g. 'TARGETID', 'RA'). */
  name: string;
  /** TFORMn, verbatim (e.g. 'D', 'E', 'K', '8A', '2K'). */
  form: string;
  /** Byte offset of this column within a row. */
  byteOffset: number;
  /** Byte length of this column within a row. */
  byteLength: number;
};

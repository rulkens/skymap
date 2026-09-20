/** One entry in a `statusForError` rule list: `test` decides whether this
 *  rule claims `err`, `status` is the HTTP status to report when it does. */
export type ErrorStatusRule = {
  readonly test: (err: unknown) => boolean;
  readonly status: number;
};

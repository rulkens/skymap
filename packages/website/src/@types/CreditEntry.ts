/**
 * One entry of ATTRIBUTIONS.md as the credits page prints it. Every text is
 * the record's own Markdown: `name` its heading, `by` and `licence` its
 * bullets of those names, `asks` its Attribution bullet with its paragraphs
 * and block quotes kept.
 */
export type CreditEntry = {
  readonly id: string;
  readonly name: string;
  readonly by: string;
  readonly licence: string;
  readonly asks: string;
};

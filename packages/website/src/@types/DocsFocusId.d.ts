/**
 * One way of writing the value of `focus`, as the URL parameters page prints
 * it. `prefix` is what the id begins with, or the whole id when it has one
 * spelling; a famous galaxy's id has no prefix, so its row leaves it out.
 */
export type DocsFocusId = {
  form: string;
  prefix?: string;
  example: string;
  names: string;
};

/**
 * removeImportKeepingTrivia — delete one import declaration without taking the
 * comments and blank lines around it. ts-morph's `ImportDeclaration.remove()`
 * deletes the node's leading trivia too, so removing a file's first import lost
 * its module header and removing a mid-file one fused the import groups either
 * side. We remove normally (ts-morph rejects a raw text deletion that changes the
 * statement list), then re-insert what it over-deleted: the result is the text
 * with only the node's own span and line break gone, where a blank line is dropped
 * only if it would otherwise double up with the one before.
 */

import type { ImportDeclaration } from 'ts-morph';

export function removeImportKeepingTrivia(decl: ImportDeclaration): void {
  const file = decl.getSourceFile();
  const text = file.getFullText();
  const start = decl.getStart();
  let end = decl.getEnd();
  if (text[end] === '\r') end++;
  if (text[end] === '\n') end++;
  if (text.slice(start - 2, start) === '\n\n' && text[end] === '\n') end++;
  const desired = text.slice(0, start) + text.slice(end);

  decl.remove();

  // `desired` differs from the post-remove text by one pure insertion; locate it
  // by the longest common prefix, then suffix, of what is left.
  const current = file.getFullText();
  let prefix = 0;
  while (prefix < current.length && current[prefix] === desired[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < current.length - prefix &&
    current[current.length - 1 - suffix] === desired[desired.length - 1 - suffix]
  ) {
    suffix++;
  }
  const inserted = desired.slice(prefix, desired.length - suffix);
  if (inserted.length > 0) file.insertText(prefix, inserted);
}

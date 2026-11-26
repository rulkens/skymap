import type { NodeLocation } from './NodeLocation';
import type { RelatedDeclaration } from './RelatedDeclaration';

/** What one engine query answers: the references, and the other declarations tied to them. */
export type ReferencedSymbols = {
  readonly references: readonly NodeLocation[]; // the declaration included, each file once
  readonly related: readonly RelatedDeclaration[]; // declarations other than the queried one
};

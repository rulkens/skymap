/**
 * ActionMatcher — the one capability a `HashParamSource`'s `writesOn` list needs
 * from an RTK action creator: `match`, the "is this that action?" question.
 *
 * The list arm of `writesOn` is authored with real action creators
 * (`requestFocus`, `setOrientation`), but the write saga only ever asks each one
 * whether a dispatched action is its own. Typing the field as that capability
 * rather than as a union of RTK's five `ActionCreatorWith*` shapes accepts every
 * creator — payload, payload-less, prepared — with no generics to thread through
 * the table, and states in the type what the table is actually for.
 *
 * Redux's own `ActionCreator` is the wrong type here despite the name: it
 * describes a function that BUILDS an action and carries no `match` at all. RTK
 * has an internal `HasMatchFunction` that is exactly this shape but does not
 * export it, hence the local declaration.
 *
 * `match` is declared returning `boolean` rather than as a type predicate: the
 * write side asks a yes/no question and never narrows the action it was handed.
 * A predicate signature is still assignable to this one, so the real creators
 * satisfy it unchanged.
 */

import type { Action } from '@reduxjs/toolkit';

export type ActionMatcher = {
  readonly match: (action: Action) => boolean;
};

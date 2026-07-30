/**
 * LabelHome — one source type's label-visibility read/write pair.
 *
 * The two directions of the same fact: `read` pulls a category's label bit out
 * of the bundled homes, `write` produces the action that sets it. Keeping them
 * on ONE row is what makes the table's correctness locally checkable — a
 * mismatched pair (reading the structure record, writing the galaxy-catalog
 * setter) is visible in three lines rather than split across a projection
 * module and a container.
 *
 * `write` returns RTK's `Action` supertype: these are dispatched verbatim, and
 * the slice creators enforce payload correctness at their own call sites — the
 * same posture `VISIBILITY_ACTION_ROW` takes.
 */

import type { Action } from '@reduxjs/toolkit';
import type { LabelCategory } from '../engine/data/LabelCategory';
import type { LabelHomes } from './LabelHomes';

export type LabelHome = {
  readonly read: (homes: LabelHomes, id: LabelCategory) => boolean;
  readonly write: (id: LabelCategory, enabled: boolean) => Action;
};

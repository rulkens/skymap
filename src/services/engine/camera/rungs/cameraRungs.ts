/**
 * The rung table (spec §2.4): a new rung is a new `RungKind` key plus its row.
 * Getters, not fields: a row reaches back up through `hostOrThrow` → `rowFor`
 * → here, so a field read would freeze `undefined` into the table whenever a
 * row module is the import cycle's entry.
 */

import type { ClimbRow } from '../../../../@types/camera/ClimbRow';
import type { ClimbableKind } from '../../../../@types/camera/ClimbableKind';
import type { RungRow } from '../../../../@types/camera/RungRow';
import { absoluteRung } from './absoluteRung';
import { bodyRung } from './bodyRung';
import { siteRung } from './siteRung';

export const CAMERA_RUNGS: { readonly absolute: RungRow<'absolute'> } & {
  readonly [K in ClimbableKind]: ClimbRow<K>;
} = {
  get absolute() {
    return absoluteRung;
  },
  get body() {
    return bodyRung;
  },
  get site() {
    return siteRung;
  },
};

/** What each row kind edits: its Effect arm, the clip's start, or one flyPath waypoint. */
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { Effect } from '../../../../../src/@types/animation/Effect';
import type { PathWaypoint } from '../../../../../src/@types/animation/PathWaypoint';
import type { EffectKind } from './EffectKind';

export type RowSubjects = { readonly [K in EffectKind]: Extract<Effect, { kind: K }> } & {
  readonly start: ClipData['start'];
  /** `last` is the one thing a waypoint needs from its path: the final one is labelled Settle. */
  readonly waypoint: PathWaypoint & { readonly last: boolean };
};

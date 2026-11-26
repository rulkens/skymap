/** What each row kind edits: its Effect arm, the clip's start, or one flyPath waypoint. */
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { Effect } from '../../../../../src/@types/animation/Effect';
import type { PathWaypoint } from '../../../../../src/@types/animation/PathWaypoint';
import type { EffectKind } from './EffectKind';

export type RowSubjects = { readonly [K in EffectKind]: Extract<Effect, { kind: K }> } & {
  readonly start: ClipData['start'];
  /** From its path: the last one is labelled Settle, and an unset linger takes the path's. */
  readonly waypoint: PathWaypoint & { readonly last: boolean; readonly pathLinger: number };
};

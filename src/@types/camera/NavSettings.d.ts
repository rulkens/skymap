import type { FrictionGroup } from './FrictionGroup';

/** NavSettings — the user's navigator dials: friction in seconds, and one toggle per group. */
export type NavSettings = {
  readonly friction: number;
  readonly frictionOn: Readonly<Record<FrictionGroup, boolean>>;
};

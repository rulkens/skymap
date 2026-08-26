/**
 * SlabFrame — which coordinate frame (and therefore which units) a slab's
 * `vp` and the geometry drawn into it are expressed in.
 *
 * `kind` doubles as the unit tag: `world-mpc` geometry is in Mpc about the
 * world origin (optionally shifted by `RENDER_ORIGIN_MPC`), `body-m` geometry
 * is in SI metres about a body's own centre, so near-field precision no longer
 * depends on distance from one shared render origin.
 */

import type { BodyId } from '../../data/body/BodyId';

export type SlabFrame =
  /** `originRelative: true` ⇒ geometry deltas are computed as pos − renderOrigin. */
  { kind: 'world-mpc'; originRelative: boolean } | { kind: 'body-m'; bodyId: BodyId };

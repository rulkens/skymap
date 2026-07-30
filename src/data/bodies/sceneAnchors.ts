/**
 * SCENE_ANCHORS — roots of the focus graph: positions stated outright, not
 * derived from `OrbitalElements`.
 *
 * The Sun's `[0, 0, 0]` is authored, not a reference to `RENDER_ORIGIN_MPC`
 * (`data/renderOrigin.ts`) — they are different facts that share a value only
 * because the origin was chosen to be the Sun. `renderOrigin.ts:15-18` flags a
 * future dynamic origin; importing the constant here would drag the Sun along
 * with a moving frame instead of leaving it fixed in heliocentric space.
 */

import type { AnchorBody } from '../../@types/scene/AnchorBody';

export const SCENE_ANCHORS: readonly AnchorBody[] = [{ id: 'sun', positionMpc: [0, 0, 0] }];

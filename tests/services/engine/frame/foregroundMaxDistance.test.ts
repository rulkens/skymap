/**
 * foregroundMaxDistance — pins the shared NEAR0 foreground gate's two
 * load-bearing properties:
 *
 *   1. It ENCLOSES the farthest seeded body (with real headroom), so no
 *      foreground element is ever gated off while it could still be the
 *      subject on screen. A future farther seed that outgrows the derived
 *      gate — or a refactor that breaks the derivation — fails here.
 *   2. It stays far below galaxy scale (< 1 Mpc), pinning it as a NEAR-FIELD
 *      gate: at galaxy / cosmic zoom every NEAR0 foreground pass must read
 *      idle, which is the whole point of the gate.
 */

import { describe, it, expect } from 'vitest';

import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../src/services/engine/frame/foregroundMaxDistance';
import { SCENE_BODIES } from '../../../../src/data/bodies/sceneBodies';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';

describe('FOREGROUND_MAX_DISTANCE_MPC', () => {
  it('encloses the farthest seeded body and stays far below galaxy scale', () => {
    // Every seeded body's world position comes from the derived snapshot —
    // orbital rows propagated, stars seeded from their anchors.
    const states = deriveBodyStates(CONST_J2000);
    const farthestMpc = Math.max(
      ...SCENE_BODIES.map((body) => {
        const p = states.get(body.id)!.positionMpc;
        return Math.hypot(p[0], p[1], p[2]);
      }),
    );

    // Nothing seeded may sit outside its own render gate — and the margin
    // must be generous (not a hair above the seed extent), so the star-points
    // backdrop is not cut while the neighbourhood is still being framed.
    expect(FOREGROUND_MAX_DISTANCE_MPC).toBeGreaterThan(farthestMpc);
    expect(FOREGROUND_MAX_DISTANCE_MPC).toBeGreaterThanOrEqual(farthestMpc * 100);

    // A near-field gate: at galaxy scale (>= 1 Mpc) every NEAR0 foreground
    // layer must be off.
    expect(FOREGROUND_MAX_DISTANCE_MPC).toBeLessThan(1);
  });
});

import { describe, it, expect } from 'vitest';
import { debugSphereLabels } from '../../../../src/services/engine/presentation/debugSphereLabels';
import { DEBUG_SPHERE_BODIES } from '../../../../src/data/bodies/debugSphereBody';

describe('debugSphereLabels', () => {
  const labels = debugSphereLabels();

  it('emits one label per debug body', () => {
    expect(labels).toHaveLength(DEBUG_SPHERE_BODIES.length);
  });

  it('anchors each label at its body position (renderOrigin is the Sun, so == positionMpc)', () => {
    const sun = labels.find((l) => l.text === 'Sun');
    const earth = labels.find((l) => l.text === 'Earth');
    // RENDER_ORIGIN_MPC is [0,0,0], so the renderOrigin-relative worldPos
    // equals the absolute body position.
    expect(sun!.worldPos).toEqual([0, 0, 0]);
    expect(earth!.worldPos[0]).toBeGreaterThan(0); // Earth sits at +X (1 AU).
    expect(earth!.worldPos[1]).toBe(0);
    expect(earth!.worldPos[2]).toBe(0);
  });
});

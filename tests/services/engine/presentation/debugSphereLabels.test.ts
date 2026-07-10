import { describe, it, expect } from 'vitest';
import { debugSphereLabels } from '../../../../src/services/engine/presentation/debugSphereLabels';
import { DEBUG_SPHERE_BODIES } from '../../../../src/data/bodies/debugSphereBody';

describe('debugSphereLabels', () => {
  const labels = debugSphereLabels();

  it('emits one label per debug body', () => {
    expect(labels).toHaveLength(DEBUG_SPHERE_BODIES.length);
  });

  it('labels the Sun by name (Earth caption retires until the caption-repoint task lands)', () => {
    expect(labels.map((l) => l.text).sort()).toEqual(['Sun']);
  });

  it('anchors each label at its body position (renderOrigin is the Sun, so == positionMpc)', () => {
    const sun = labels.find((l) => l.text === 'Sun');
    // RENDER_ORIGIN_MPC is [0,0,0], so the renderOrigin-relative worldPos
    // equals the absolute body position.
    expect(sun!.worldPos).toEqual([0, 0, 0]);
  });

  it('uses a registered font and stable per-body ids', () => {
    for (const label of labels) {
      expect(label.font).toBe('cormorant');
      expect(label.id).toBe(`debugSphere-${label.text}`);
      expect(label.alignX).toBe('center');
    }
  });
});

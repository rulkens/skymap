import { describe, it, expect } from 'vitest';
import { sceneBodyLabels } from '../../../../src/services/engine/presentation/sceneBodyLabels';
import {
  SCENE_BODIES,
  SCENE_EARTH,
  SCENE_STARS,
  SCENE_PLANETS,
} from '../../../../src/data/bodies/sceneBodies';

describe('sceneBodyLabels', () => {
  const labels = sceneBodyLabels();

  it('emits one label per seeded scene body (Earth + stars + planets)', () => {
    expect(labels).toHaveLength(SCENE_BODIES.length);
    expect(labels).toHaveLength(1 + SCENE_STARS.length + SCENE_PLANETS.length);
  });

  it('stays inside the foreground label renderer default capacity (maxLabels 64)', () => {
    // initGpu constructs the caption renderer with createLabelRenderer's
    // defaults; setLabels silently clamps at maxLabels, so a seed-table
    // growth past the cap would otherwise drop captions without a trace.
    expect(labels.length).toBeLessThanOrEqual(64);
  });

  it('anchors each label at its body position (renderOrigin is the Sun, so == positionMpc)', () => {
    // RENDER_ORIGIN_MPC is [0,0,0], so the renderOrigin-relative worldPos
    // equals the absolute body position.
    const sun = labels.find((label) => label.text === 'Sun')!;
    expect(sun.worldPos).toEqual([0, 0, 0]);
    const earth = labels.find((label) => label.text === 'Earth')!;
    expect(earth.worldPos).toEqual([...SCENE_EARTH.positionMpc]);
  });

  it('tints each label from its body record (spectral colour / albedo / Earth blue)', () => {
    const vega = SCENE_STARS.find((star) => star.id === 'vega')!;
    const vegaLabel = labels.find((label) => label.id === 'sceneBody-vega')!;
    expect(vegaLabel.color).toEqual([...vega.color, 1]);
    const moon = SCENE_PLANETS.find((planet) => planet.id === 'moon')!;
    const moonLabel = labels.find((label) => label.id === 'sceneBody-moon')!;
    expect(moonLabel.color).toEqual([...moon.albedo, 1]);
    const earthLabel = labels.find((label) => label.id === 'sceneBody-earth')!;
    expect(earthLabel.color).toEqual([0.5, 0.72, 1, 1]);
  });

  it('staggers the co-located captions vertically (Sun below, Earth above, Moon below)', () => {
    const byId = new Map(labels.map((label) => [label.id, label]));
    expect(byId.get('sceneBody-sun')!.alignY).toBe('top');
    expect(byId.get('sceneBody-earth')!.alignY).toBe('bottom');
    expect(byId.get('sceneBody-moon')!.alignY).toBe('top');
    expect(byId.get('sceneBody-jupiter')!.alignY).toBe('baseline');
    expect(byId.get('sceneBody-vega')!.alignY).toBe('baseline');
  });

  it('uses a registered font and stable per-body ids', () => {
    for (const label of labels) {
      expect(label.font).toBe('cormorant');
      expect(label.id).toMatch(/^sceneBody-[a-z0-9-]+$/);
      expect(label.alignX).toBe('center');
    }
    // ids are unique — one caption per body, addressable for future fades.
    expect(new Set(labels.map((label) => label.id)).size).toBe(labels.length);
  });
});

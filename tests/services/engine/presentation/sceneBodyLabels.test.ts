import { describe, it, expect } from 'vitest';
import {
  sceneBodyLabels,
  FOREGROUND_LABEL_CAPACITY,
} from '../../../../src/services/engine/presentation/sceneBodyLabels';
import { FAMOUS_LABEL_STYLE } from '../../../../src/services/engine/presentation/famousLabelStyle';
import { SCENE_BODIES } from '../../../../src/data/bodies/sceneBodies';
import { SCENE_STARS } from '../../../../src/data/bodies/sceneStars';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';

// Earth's label position comes from the derived J2000 snapshot, the same source
// `sceneBodyLabels` reads; RENDER_ORIGIN_MPC is the Sun so worldPos == positionMpc.
const EARTH_POS = deriveBodyStates(CONST_J2000).get('earth')!.positionMpc;

describe('sceneBodyLabels', () => {
  const labels = sceneBodyLabels();

  it('emits one label per seeded scene body (Earth + stars + planets)', () => {
    expect(labels).toHaveLength(SCENE_BODIES.length);
    expect(labels).toHaveLength(1 + SCENE_STARS.length + SCENE_PLANETS.length);
  });

  it('fits inside the foreground label renderer capacity (no silent caption drop)', () => {
    // initGpu sizes the caption renderer with FOREGROUND_LABEL_CAPACITY (not
    // createLabelRenderer's 64-label default); setLabels silently clamps at
    // maxLabels, so a roster that outgrew the buffer would drop captions
    // without a trace. Both the capacity and this label set derive from the
    // same roster, so this pins that the derived buffer actually covers it.
    expect(labels.length).toBeLessThanOrEqual(FOREGROUND_LABEL_CAPACITY);
  });

  it('anchors each label at its body position (renderOrigin is the Sun, so == positionMpc)', () => {
    // RENDER_ORIGIN_MPC is [0,0,0], so the renderOrigin-relative worldPos
    // equals the absolute body position.
    const sun = labels.find((label) => label.text === 'Sun')!;
    expect(sun.worldPos).toEqual([0, 0, 0]);
    const earth = labels.find((label) => label.text === 'Earth')!;
    expect(earth.worldPos).toEqual([...EARTH_POS]);
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

  it('sizes captions comparably to famous labels (shares the famous pixel clamps)', () => {
    // Parity treatment: a scene-body caption must clamp to the SAME projected-em
    // pixel band as a famous-galaxy label, and by reference to the one
    // FAMOUS_LABEL_STYLE constant — not a re-typed 30/150 pair — so a future
    // retune of the famous band carries here instead of silently drifting apart.
    for (const label of labels) {
      expect(label.minPixelSize).toBe(FAMOUS_LABEL_STYLE.minPixelSize);
      expect(label.maxPixelSize).toBe(FAMOUS_LABEL_STYLE.maxPixelSize);
    }
    // And it is a genuine bump off the retired painted-on-body 13/44 band —
    // guards against the constants being re-pointed back to the old small tags.
    expect(FAMOUS_LABEL_STYLE.minPixelSize).toBeGreaterThan(13);
    expect(FAMOUS_LABEL_STYLE.maxPixelSize).toBeGreaterThan(44);
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

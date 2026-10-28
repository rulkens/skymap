import { describe, it, expect } from 'vitest';
import { sceneBodyLabels } from '../../../../src/layers/body/present/sceneBodyLabels';
import { FAMOUS_LABEL_STYLE } from '../../../../src/services/engine/presentation/famousLabelStyle';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { compressBrightness } from '../../../../src/utils/color/compressBrightness';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';

// RENDER_ORIGIN_MPC is the Sun, so worldPos == positionMpc throughout.
const J2000_STATES = deriveBodyStates(CONST_J2000);
const EARTH_POS = J2000_STATES.get(asSceneBodyId('earth'))!.positionMpc;

describe('sceneBodyLabels', () => {
  const labels = sceneBodyLabels(J2000_STATES);

  it('emits one label per scene body (Earth + planets, no mesh body)', () => {
    expect(labels).toHaveLength(1 + SCENE_PLANETS.length);
  });

  it('anchors each label at its body position (renderOrigin is the Sun, so == positionMpc)', () => {
    const earth = labels.find((label) => label.text === 'Earth')!;
    expect(earth.worldPos).toEqual([...EARTH_POS]);
  });

  it('a body caption position tracks the snapshot when simDays changes', () => {
    const laterStates = deriveBodyStates(CONST_J2000 + 120);
    const laterLabels = sceneBodyLabels(laterStates);

    const earthNow = labels.find((label) => label.id === 'sceneBody-earth')!;
    const earthLater = laterLabels.find((label) => label.id === 'sceneBody-earth')!;
    expect(earthLater.worldPos).toEqual([...laterStates.get(asSceneBodyId('earth'))!.positionMpc]);
    expect(earthLater.worldPos).not.toEqual(earthNow.worldPos);
  });

  it('tints each label from its body record (lifted albedo / Earth blue)', () => {
    const moon = SCENE_PLANETS.find((planet) => planet.id === 'moon')!;
    const moonLabel = labels.find((label) => label.id === 'sceneBody-moon')!;
    expect(moonLabel.color).toEqual([...compressBrightness(moon.albedo, 0.3), 1]);
    const earthLabel = labels.find((label) => label.id === 'sceneBody-earth')!;
    expect(earthLabel.color).toEqual([0.5, 0.72, 1, 1]);
  });

  it('staggers the co-located captions vertically (Earth above, Moon below)', () => {
    const byId = new Map(labels.map((label) => [label.id, label]));
    expect(byId.get('sceneBody-earth')!.alignY).toBe('bottom');
    expect(byId.get('sceneBody-moon')!.alignY).toBe('top');
    expect(byId.get('sceneBody-jupiter')!.alignY).toBe('baseline');
  });

  it('sizes captions comparably to famous labels (shares the famous pixel clamps)', () => {
    // By reference to FAMOUS_LABEL_STYLE, not a re-typed pair, so a retune carries here.
    for (const label of labels) {
      expect(label.minPixelSize).toBe(FAMOUS_LABEL_STYLE.minPixelSize);
      expect(label.maxPixelSize).toBe(FAMOUS_LABEL_STYLE.maxPixelSize);
    }
    expect(FAMOUS_LABEL_STYLE.minPixelSize).toBeGreaterThan(13);
    expect(FAMOUS_LABEL_STYLE.maxPixelSize).toBeGreaterThan(44);
  });

  it('uses a registered font and stable per-body ids', () => {
    for (const label of labels) {
      expect(label.font).toBe('cormorant');
      expect(label.id).toMatch(/^sceneBody-[a-z0-9-]+$/);
      expect(label.alignX).toBe('center');
    }
    expect(new Set(labels.map((label) => label.id)).size).toBe(labels.length);
  });
});

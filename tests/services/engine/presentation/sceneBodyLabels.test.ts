import { describe, it, expect } from 'vitest';
import { sceneBodyLabels } from '../../../../src/services/engine/presentation/sceneBodyLabels';
import { FAMOUS_LABEL_STYLE } from '../../../../src/services/engine/presentation/famousLabelStyle';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { SCENE_MESH_BODIES } from '../../../../src/data/bodies/sceneMeshBodies';
import { ANCHORED_MESH_BODY_IDS } from '../../../../src/data/bodies/anchoredMeshBodyIds';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { scaleToUnitMax } from '../../../../src/utils/color/scaleToUnitMax';

// The caller passes the per-frame body snapshot; these tests use the J2000
// instant. RENDER_ORIGIN_MPC is the Sun, so worldPos == positionMpc.
const J2000_STATES = deriveBodyStates(CONST_J2000);
const EARTH_POS = J2000_STATES.get('earth')!.positionMpc;

describe('sceneBodyLabels', () => {
  const labels = sceneBodyLabels(J2000_STATES);

  it('emits one label per core scene body (Earth + planets + non-anchored mesh bodies)', () => {
    // The seeded stars and the Sun caption from the star Layer's own producer
    // (`produceStarCaptions`) now, not here — core keeps only the bodies whose
    // identity core owns.
    const captioned = SCENE_MESH_BODIES.filter((body) => !ANCHORED_MESH_BODY_IDS.has(body.id));
    expect(labels).toHaveLength(1 + SCENE_PLANETS.length + captioned.length);
  });

  it('leaves anchored scans uncaptioned', () => {
    expect(ANCHORED_MESH_BODY_IDS.size).toBeGreaterThan(0);
    for (const id of ANCHORED_MESH_BODY_IDS) {
      expect(labels.some((label) => label.id === `sceneBody-${id}`)).toBe(false);
    }
  });

  it('anchors each label at its body position (renderOrigin is the Sun, so == positionMpc)', () => {
    // RENDER_ORIGIN_MPC is [0,0,0], so the renderOrigin-relative worldPos
    // equals the absolute body position.
    const earth = labels.find((label) => label.text === 'Earth')!;
    expect(earth.worldPos).toEqual([...EARTH_POS]);
  });

  it('a body caption position tracks the snapshot when simDays changes', () => {
    // Earth + planets read their anchor from the passed snapshot, so a DIFFERENT
    // sim instant (Earth swept ~120 days along its orbit) moves the Earth caption
    // to the new world position — the label FOLLOWS the body.
    const laterStates = deriveBodyStates(CONST_J2000 + 120);
    const laterLabels = sceneBodyLabels(laterStates);

    const earthNow = labels.find((label) => label.id === 'sceneBody-earth')!;
    const earthLater = laterLabels.find((label) => label.id === 'sceneBody-earth')!;
    // RENDER_ORIGIN is the Sun, so worldPos == the snapshot position exactly.
    expect(earthLater.worldPos).toEqual([...laterStates.get('earth')!.positionMpc]);
    expect(earthLater.worldPos).not.toEqual(earthNow.worldPos);
  });

  it('tints each label from its body record (albedo / Earth blue)', () => {
    const moon = SCENE_PLANETS.find((planet) => planet.id === 'moon')!;
    const moonLabel = labels.find((label) => label.id === 'sceneBody-moon')!;
    expect(moonLabel.color).toEqual([...moon.albedo, 1]);
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

  it('captions a seeded mesh body under its own kind', () => {
    const body = SCENE_MESH_BODIES[0]!;
    const label = labels.find((l) => l.id === `sceneBody-${body.id}`)!;

    expect(label.kind).toBe('meshBody');
    expect(label.text).toBe(body.label);
    expect(label.color).toEqual([...scaleToUnitMax(body.albedo), 1]);
  });
});

/**
 * `visibleStars` splits one store list across THREE gates: the curated map
 * answers to its star-catalog row, the Sun and the S-stars to their own body
 * rows.
 *
 * Worth a test because the three gates are separate reads a compiler cannot hold
 * together — each is one settings row among several shaped alike
 * (`starCatalogs.items.<id>.enabled`, `bodies.items.<id>.enabled`). Pointing
 * either at the wrong row leaves the function type-correct and either the
 * descent's aim point gone or the muted map still drawing. The last case pins
 * the difference between MEMBERSHIP and an exemption: the Sun survives the map's
 * gate because it is not in the set that gate governs, not because a hardcoded
 * `id === 'sun'` waves it through.
 */
import { describe, it, expect } from 'vitest';
import { visibleStars } from '../../../../src/services/engine/frame/visibleStars';
import { makeSettingsFixture } from '../../../state/settings/makeSettingsFixture';
import { SCENE_S_STARS } from '../../../../src/data/bodies/sceneSStars';

// A real S-star id, because the S-star gate is MEMBERSHIP of `SCENE_S_STARS` —
// a literal 's2' here would pass even if the routing table were built from
// something else.
const S_STAR_ID = SCENE_S_STARS[0]!.id;

const STARS = [
  { id: 'sun', name: 'Sun' },
  { id: 'sirius', name: 'Sirius' },
  { id: 'vega', name: 'Vega' },
  { id: S_STAR_ID, name: S_STAR_ID },
];

function stateWith(
  famousStarMapOn: boolean,
  clusterMasterOn = true,
  sunOn = true,
  sStarsOn = true,
) {
  const settings = makeSettingsFixture();
  settings.starCatalogs.enabled = clusterMasterOn;
  settings.starCatalogs.items.famousStar.enabled = famousStarMapOn;
  settings.bodies.items.sun.enabled = sunOn;
  settings.bodies.items['s-star'].enabled = sStarsOn;
  return { settings, data: { bodies: { stars: STARS } } } as never;
}

describe('visibleStars', () => {
  it('draws everything when every gate is on', () => {
    expect(visibleStars(stateWith(true)).map((s) => s.id)).toEqual([
      'sun',
      'sirius',
      'vega',
      S_STAR_ID,
    ]);
  });

  it('keeps the Sun and the S-stars when the famous-star row is off', () => {
    expect(visibleStars(stateWith(false)).map((s) => s.id)).toEqual(['sun', S_STAR_ID]);
  });

  it('keeps the Sun and the S-stars when the cluster master is off, whatever the row says', () => {
    // The Stars panel header derives its tri-state over EVERY star-catalog id,
    // so the master must be able to hide each row it summarises. Reading only
    // the row's own bit here would leave the curated map drawing under a
    // checkbox that says it is off — with no type error to catch it.
    expect(visibleStars(stateWith(true, false)).map((s) => s.id)).toEqual(['sun', S_STAR_ID]);
  });

  it('drops the Sun when its OWN body row is off, map on', () => {
    // The Sun answers to `bodies.items.sun`, so its row governs it the way the
    // map's row governs the map. A hardcoded `id === 'sun'` exemption would
    // keep the Sun here no matter what its row said — which is exactly the
    // shape this function stopped having.
    expect(visibleStars(stateWith(true, true, false)).map((s) => s.id)).toEqual([
      'sirius',
      'vega',
      S_STAR_ID,
    ]);
  });

  it('the S-star row is READ, not merely seeded: muting it drops them', () => {
    // The registration a body row gets is free (the settings row derives from
    // the registry), so the thing worth asserting is the READ — the same defect
    // the unread caption-fade handles record. Nothing else consults this row.
    expect(visibleStars(stateWith(true, true, true, false)).map((s) => s.id)).toEqual([
      'sun',
      'sirius',
      'vega',
    ]);
  });

  it('S-stars toggle independently of the famous-star map', () => {
    // Both directions, because a gate wired to the wrong row passes one of them
    // by accident: the map off leaves the S-stars, the S-stars off leaves the map.
    expect(visibleStars(stateWith(false)).map((s) => s.id)).toContain(S_STAR_ID);
    expect(visibleStars(stateWith(true, true, true, false)).map((s) => s.id)).toContain('sirius');
  });
});

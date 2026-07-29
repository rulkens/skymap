/**
 * `visibleStars` splits one seed table across TWO gates: the curated map
 * answers to its star-catalog row, the Sun to its own body row.
 *
 * Worth a test because the two gates are separate reads a compiler cannot hold
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

const STARS = [
  { id: 'sun', name: 'Sun' },
  { id: 'sirius', name: 'Sirius' },
  { id: 'vega', name: 'Vega' },
];

function stateWith(famousStarMapOn: boolean, clusterMasterOn = true, sunOn = true) {
  const settings = makeSettingsFixture();
  settings.starCatalogs.enabled = clusterMasterOn;
  settings.starCatalogs.items.famousStar.enabled = famousStarMapOn;
  settings.bodies.items.sun.enabled = sunOn;
  return { settings, data: { bodies: { stars: STARS } } } as never;
}

describe('visibleStars', () => {
  it('draws the whole seeded map when the famous-star row is on', () => {
    expect(visibleStars(stateWith(true)).map((s) => s.id)).toEqual(['sun', 'sirius', 'vega']);
  });

  it('draws the Sun alone when the famous-star row is off', () => {
    expect(visibleStars(stateWith(false)).map((s) => s.id)).toEqual(['sun']);
  });

  it('draws the Sun alone when the cluster master is off, whatever the row says', () => {
    // The Stars panel header derives its tri-state over EVERY star-catalog id,
    // so the master must be able to hide each row it summarises. Reading only
    // the row's own bit here would leave the curated map drawing under a
    // checkbox that says it is off — with no type error to catch it.
    expect(visibleStars(stateWith(true, false)).map((s) => s.id)).toEqual(['sun']);
  });

  it('drops the Sun when its OWN body row is off, map on', () => {
    // The Sun answers to `bodies.items.sun`, so its row governs it the way the
    // map's row governs the map. A hardcoded `id === 'sun'` exemption would
    // keep the Sun here no matter what its row said — which is exactly the
    // shape this function stopped having.
    expect(visibleStars(stateWith(true, true, false)).map((s) => s.id)).toEqual(['sirius', 'vega']);
  });
});

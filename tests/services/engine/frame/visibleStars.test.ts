/**
 * `visibleStars` must keep the Sun on screen when the curated famous-star map
 * is muted — the toggle hides the MAP, never the solar system's anchor.
 *
 * Worth a test because the gate and the exemption are two separate reads that
 * a compiler cannot hold together: the gate is one settings row among several
 * shaped alike (`starCatalogs.items.<id>.enabled`), and the exemption is a
 * bare `id === 'sun'` filter. Pointing the gate at the wrong row, or losing the
 * exemption, leaves the function type-correct and the descent's aim point gone.
 */
import { describe, it, expect } from 'vitest';
import { visibleStars } from '../../../../src/services/engine/frame/visibleStars';
import { makeSettingsFixture } from '../../../state/settings/makeSettingsFixture';

const STARS = [
  { id: 'sun', name: 'Sun' },
  { id: 'sirius', name: 'Sirius' },
  { id: 'vega', name: 'Vega' },
];

function stateWith(famousStarMapOn: boolean, clusterMasterOn = true) {
  const settings = makeSettingsFixture();
  settings.starCatalogs.enabled = clusterMasterOn;
  settings.starCatalogs.items.famousStar.enabled = famousStarMapOn;
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
});

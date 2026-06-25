/**
 * webShowcase tests — pin the "named cosmic web" tour's structure: an
 * establishing Milky Way beat that strips the scene, then a Virgo isolate beat.
 *
 * These assert on the beat data (it IS plain data) — the focus targets and the
 * scene-setup effects — without running the tour saga. The end-to-end fly +
 * isolate behaviour is covered by the guided-tour saga suites.
 */

import { describe, it, expect } from 'vitest';
import { webShowcase } from '../../../../src/data/animation/tours/webShowcase';
import {
  setVolumesEnabled,
  setFilamentsEnabled,
  setGalaxyCatalogLabelEnabled,
} from '../../../../src/state/settings/settingsSlice';

describe('webShowcase tour', () => {
  it('opens on the Milky Way and isolates the Virgo Cluster', () => {
    expect(webShowcase.beats).toHaveLength(2);
    expect(webShowcase.beats[0]!.focus).toEqual({ type: 'milkyWay' });
    expect(webShowcase.beats[1]!.focus).toEqual({ type: 'structure', id: 'cluster-virgo-m87' });
  });

  it('strips the scene to the labelled web on the opening beat', () => {
    // The opening beat fires the scene-setup actions; the guided-tour
    // snapshot/restore pair winds them back at tour end.
    const effects = webShowcase.beats[0]!.effects ?? [];
    expect(effects).toContainEqual(setVolumesEnabled(false));
    expect(effects).toContainEqual(setFilamentsEnabled(false));
    expect(effects).toContainEqual(
      setGalaxyCatalogLabelEnabled({ id: 'famousGalaxy', enabled: false }),
    );
  });
});

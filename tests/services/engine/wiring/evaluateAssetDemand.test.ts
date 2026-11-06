/**
 * evaluateAssetDemand — the one reader of every row's declared demand. A hand-built entry set
 * (an `out` and an `in` band, a band measured from Earth, a label entry) keeps the edges
 * independent of any Layer's tuning.
 */

import { describe, expect, it } from 'vitest';

import { evaluateAssetDemand } from '../../../../src/services/engine/wiring/evaluateAssetDemand';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { AssetDemand } from '../../../../src/@types/loading/AssetDemand';
import type { DeclaredDemand } from '../../../../src/@types/loading/DeclaredDemand';
import type { AssetWiringRow } from '../../../../src/@types/loading/AssetWiringRow';
import type { DemandCtx } from '../../../../src/@types/loading/DemandCtx';
import type { EngineSettingsState } from '../../../../src/@types/settings/EngineSettingsState';
import type { UiState } from '../../../../src/@types/ui/UiState';
import type { VisibilityAddress } from '../../../../src/@types/animation/VisibilityAddress';
import type { VisibilityEntry } from '../../../../src/@types/engine/layer/VisibilityEntry';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const at = (a: string) => a as VisibilityAddress;

const ENTRIES: readonly VisibilityEntry[] = [
  {
    key: 'bubble',
    bands: { shell: { out: [4, 10] }, hole: { in: [1, 2] }, both: { in: [0.4, 1], out: [4, 10] } },
  },
  {
    key: 'sats',
    items: ['a', 'b'],
    selects: ['satellite'],
    bands: {
      nearEarth: { out: [1e-14, 2e-14], from: SCENE_EARTH.id },
      onlyA: { out: [1, 2], items: ['a'] },
    },
  },
  { label: 'sat', cluster: 'satLabels', of: 'sats', items: ['a', 'b'] },
];

type Switches = { bubble?: boolean; a?: boolean; b?: boolean; labelA?: boolean };

function ctx(
  over: Partial<Omit<DemandCtx, 'settings'>> = {},
  { bubble = true, a = true, b = true, labelA = false }: Switches = {},
): DemandCtx {
  return {
    settings: {
      bubble: { enabled: bubble },
      sats: { enabled: true, items: { a: { enabled: a }, b: { enabled: b } } },
      satLabels: { items: { a: { labelEnabled: labelA }, b: { labelEnabled: false } } },
    } as unknown as EngineSettingsState,
    ui: { paletteOpen: false } as UiState,
    slotState: () => 'idle',
    cameraPosMpc: [0, 0, 0],
    simDays: CONST_J2000,
    drawPxPerRad: 0,
    tier: 'medium',
    selectedKinds: new Set(),
    ...over,
  };
}

const row = (demand: AssetDemand, gates?: AssetWiringRow['gates']) => ({ demand, gates });
const run = (r: ReturnType<typeof row>, c: DemandCtx) => evaluateAssetDemand(r, c, ENTRIES);
const camX = (x: number): Partial<DemandCtx> => ({ cameraPosMpc: [x, 0, 0] });

const LOAD = { demand: true, release: false };
const HOLD = { demand: false, release: false };
const RELEASE = { demand: false, release: true };

describe('evaluateAssetDemand', () => {
  it("'always' demands and never releases", () => {
    expect(run(row('always'), ctx())).toEqual(LOAD);
  });

  it("'whenSearching' follows the palette and never releases", () => {
    expect(run(row('whenSearching'), ctx())).toEqual(HOLD);
    expect(run(row('whenSearching'), ctx({ ui: { paletteOpen: true } as UiState }))).toEqual(LOAD);
  });

  it('companionOf demands once the parent leaves idle and never releases', () => {
    const companion = row({ companionOf: 'parent' });
    expect(run(companion, ctx({ slotState: () => 'idle' }))).toEqual(HOLD);
    expect(run(companion, ctx({ slotState: () => 'loading' }))).toEqual(LOAD);
  });

  it('an object row releases when its switch is off', () => {
    expect(run(row({}, at('bubble')), ctx())).toEqual(LOAD);
    expect(run(row({}, at('bubble')), ctx({}, { bubble: false }))).toEqual(RELEASE);
  });

  it('tiers excludes and releases outside the listed tiers', () => {
    const tiered = row({ tiers: ['medium', 'large'] }, at('bubble'));
    expect(run(tiered, ctx({ tier: 'medium' }))).toEqual(LOAD);
    expect(run(tiered, ctx({ tier: 'small' }))).toEqual(RELEASE);
  });

  it('out edge loads within e·lead and releases beyond e·release', () => {
    const shell = row({ near: { band: 'shell', edge: 'out', lead: 2, release: 4 } }, at('bubble'));
    const e = 10;
    expect(run(shell, ctx(camX(e * 2 * 0.99)))).toEqual(LOAD);
    expect(run(shell, ctx(camX(e * 2 * 1.01)))).toEqual(HOLD);
    expect(run(shell, ctx(camX(e * 4 * 1.01)))).toEqual(RELEASE);
  });

  it('in edge loads beyond e/lead and releases below e/release', () => {
    const hole = row({ near: { band: 'hole', edge: 'in', lead: 2, release: 4 } }, at('bubble'));
    const e = 1;
    expect(run(hole, ctx(camX((e / 2) * 1.01)))).toEqual(LOAD);
    expect(run(hole, ctx(camX((e / 2) * 0.99)))).toEqual(HOLD);
    expect(run(hole, ctx(camX((e / 4) * 0.99)))).toEqual(RELEASE);
  });

  it('both edges: loads only between the two load limits', () => {
    const both = row({ near: { band: 'both', edge: 'both', lead: 2, release: 4 } }, at('bubble'));
    expect(run(both, ctx(camX(0.3)))).toEqual(LOAD);
    expect(run(both, ctx(camX(19)))).toEqual(LOAD);
    expect(run(both, ctx(camX(0.15)))).toEqual(HOLD);
    expect(run(both, ctx(camX(21)))).toEqual(HOLD);
  });

  it('both edges: releases past either release limit', () => {
    const both = row({ near: { band: 'both', edge: 'both', lead: 2, release: 4 } }, at('bubble'));
    expect(run(both, ctx(camX(0.09)))).toEqual(RELEASE);
    expect(run(both, ctx(camX(41)))).toEqual(RELEASE);
    expect(run(both, ctx(camX(0.15))).release).toBe(false);
    expect(run(both, ctx(camX(30))).release).toBe(false);
  });

  it("a band whose items exclude the row's item does not gate it", () => {
    const near = { band: 'onlyA', edge: 'out', lead: 1.5, release: 2.5 } as const;
    const far = ctx(camX(100));
    expect(run(row({ shown: { address: at('sats'), items: ['b'] }, near }), far)).toEqual(LOAD);
    expect(run(row({ shown: { address: at('sats'), items: ['a'] }, near }), far)).toEqual(RELEASE);
  });

  it("a from-body band measures from the body's live position", () => {
    const earth = deriveBodyStates(CONST_J2000).get(SCENE_EARTH.id)!.positionMpc;
    const nearEarth: Vec3 = [earth[0] + 1e-14, earth[1], earth[2]];
    // Measured from the origin this eye sits an au out, far past the release edge.
    expect(Math.hypot(...nearEarth)).toBeGreaterThan(2e-14 * 2.5);
    const sats = row({
      shown: at('sats'),
      near: { band: 'nearEarth', edge: 'out', lead: 1.5, release: 2.5 },
    });
    expect(run(sats, ctx({ cameraPosMpc: nearEarth }))).toEqual(LOAD);
  });

  it('alsoWhen lifts the scale gate but never the switch or tier', () => {
    const lifted: DeclaredDemand = {
      shown: at('sats'),
      near: { band: 'nearEarth', edge: 'out', lead: 1.5, release: 2.5 },
      alsoWhen: ['searching', 'selected'],
    };
    const sats = row(lifted);
    const far = camX(1e-6);
    const searching = { ...far, ui: { paletteOpen: true } as UiState };
    expect(run(sats, ctx(far))).toEqual(RELEASE);
    expect(run(sats, ctx(searching))).toEqual(LOAD);
    expect(run(sats, ctx({ ...far, selectedKinds: new Set(['satellite']) }))).toEqual(LOAD);
    expect(run(sats, ctx(searching, { a: false, b: false }))).toEqual(RELEASE);
    const tiered = row({ ...lifted, tiers: ['large'] });
    expect(run(tiered, ctx(searching))).toEqual(RELEASE);
  });

  it('labelsCount: a label switch alone demands', () => {
    const off: Switches = { a: false, b: false, labelA: true };
    expect(run(row({ shown: at('sats') }), ctx({}, off))).toEqual(RELEASE);
    expect(run(row({ shown: at('sats'), labelsCount: true }), ctx({}, off))).toEqual(LOAD);
  });
});

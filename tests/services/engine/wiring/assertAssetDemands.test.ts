/**
 * assertAssetDemands — a declaration that names nothing throws at table build, with the row
 * key in the message, instead of warning from the demand loop's per-row guard every frame.
 */

import { describe, expect, it } from 'vitest';

import { assertAssetDemands } from '../../../../src/services/engine/wiring/assertAssetDemands';
import type { AssetDemand } from '../../../../src/@types/loading/AssetDemand';
import type { AssetWiringRow } from '../../../../src/@types/loading/AssetWiringRow';
import type { VisibilityAddress } from '../../../../src/@types/animation/VisibilityAddress';
import type { VisibilityEntry } from '../../../../src/@types/engine/layer/VisibilityEntry';

const at = (a: string) => a as VisibilityAddress;

const ENTRIES: readonly VisibilityEntry[] = [
  { key: 'bubble', bands: { shell: { out: [4, 10] } } },
  { key: 'sats', items: ['a'], selects: ['satellite'], bands: { near: { out: [1, 2] } } },
  { label: 'bubble', cluster: 'bubbleLabels', of: 'bubble', items: ['x'] },
];

const check = (demand: AssetDemand, gates?: AssetWiringRow['gates']) => () =>
  assertAssetDemands(
    [{ key: 'row1', slot: {} as never, req: () => undefined, priority: 0, demand, gates }],
    ENTRIES,
  );

describe('assertAssetDemands', () => {
  it('accepts every well-formed declaration', () => {
    expect(check({}, at('bubble'))).not.toThrow();
    expect(check({ shown: at('sats'), alsoWhen: ['selected'] })).not.toThrow();
    expect(
      check({ near: { band: 'shell', edge: 'out', lead: 1, release: 1 } }, at('bubble')),
    ).not.toThrow();
  });

  it('throws on an address with no entry', () => {
    expect(check({ shown: at('nowhere') })).toThrow(/'row1'/);
  });

  it('throws on an item the entry lacks', () => {
    expect(check({ shown: { address: at('sats'), items: ['clustr'] } })).toThrow(
      /'row1'.*no item 'clustr'/,
    );
  });

  it('throws on an itemed label over an itemless entry', () => {
    expect(check({ labelsCount: true }, at('bubble'))).toThrow(/'row1'.*label:bubble/);
  });

  it('throws on a band the entry lacks', () => {
    expect(
      check({ near: { band: 'nope', edge: 'out', lead: 2, release: 4 } }, at('bubble')),
    ).toThrow(/'row1'.*band 'nope'/);
  });

  it('throws on an edge the band lacks', () => {
    expect(
      check({ near: { band: 'shell', edge: 'in', lead: 2, release: 4 } }, at('bubble')),
    ).toThrow(/'row1'.*`in` edge/);
  });

  it('throws on a lead below 1', () => {
    expect(
      check({ near: { band: 'shell', edge: 'out', lead: 0.5, release: 4 } }, at('bubble')),
    ).toThrow(/'row1'/);
  });

  it('throws on a release below the lead', () => {
    expect(
      check({ near: { band: 'shell', edge: 'out', lead: 2, release: 1.5 } }, at('bubble')),
    ).toThrow(/'row1'/);
  });

  it("throws on 'selected' over an entry with no selects", () => {
    expect(check({ alsoWhen: ['selected'] }, at('bubble'))).toThrow(/'row1'.*selects/);
  });

  it('throws on an object form with neither shown nor gates', () => {
    expect(check({})).toThrow(/'row1'.*neither/);
  });
});

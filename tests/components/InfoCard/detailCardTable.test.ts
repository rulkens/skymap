import { describe, expect, it } from 'vitest';
import { detailCardTable } from '../../../src/components/InfoCard/detailCardTable';
import { APP_COMPOSITION } from '../../../src/compositions/app';
import type { Layer } from '../../../src/@types/engine/layer/Layer';

const kindOnly = (type: string) =>
  ({ name: type, selection: { kinds: [{ type }], rows: () => [] } }) as unknown as Layer<
    string,
    unknown
  >;

describe('detailCardTable', () => {
  it('folds the app composition without a missing card', () => {
    expect(() => detailCardTable(APP_COMPOSITION.layers)).not.toThrow();
  });

  it('throws naming a composed kind with no detail card', () => {
    expect(() => detailCardTable([kindOnly('globularCluster')])).toThrow(/globularCluster/);
  });
});

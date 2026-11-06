import { describe, expect, it } from 'vitest';
import { detailCardTable } from '../../../src/components/InfoCard/detailCardTable';
import type { Layer } from '../../../src/@types/engine/layer/Layer';

const kindOnly = (type: string) =>
  ({ name: type, selection: { kinds: [{ type }], rows: () => [] } }) as unknown as Layer<
    string,
    unknown
  >;

describe('detailCardTable', () => {
  it('throws naming a composed kind with no detail card', () => {
    expect(() => detailCardTable([kindOnly('globularCluster')])).toThrow(/globularCluster/);
  });
});

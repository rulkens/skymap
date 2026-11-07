import { describe, expect, it } from 'vitest';

import { stellarStreamsFetcher } from '../../../../../src/layers/stellarStreams/catalog/load/stellarStreamsFetcher';
import { stellarStreamsMetaFetcher } from '../../../../../src/layers/stellarStreams/catalog/load/stellarStreamsMetaFetcher';
import { encodeStellarStreams } from '../../../../../src/layers/stellarStreams/catalog/utils/encodeStellarStreams';
import { useFetchMock } from '../../../../setup/fetchMock';

const bin = () =>
  encodeStellarStreams({ particleCount: 2, streamCount: 2, records: new Float32Array(20) });
const metaJson = (length: number) =>
  JSON.stringify(
    Array.from({ length }, (_, i) => ({ id: `s${i}`, names: [`S${i}`], centrelineMpc: [] })),
  );

const signal = new AbortController().signal;
const noProgress = () => {};

describe('stellar streams pair check', () => {
  const fetch = useFetchMock();

  it('rejects a bin whose stream count disagrees with the committed meta', async () => {
    fetch.mock.mockResolvedValue(new Response(bin(), { status: 200 }));
    await expect(stellarStreamsFetcher(() => 3)(undefined, signal, noProgress)).rejects.toThrow(
      /length mismatch.*npm run build-stellar-streams/,
    );
  });

  it('rejects a meta whose length disagrees with the loaded bin', async () => {
    fetch.mock.mockResolvedValue(new Response(metaJson(3), { status: 200 }));
    await expect(stellarStreamsMetaFetcher(() => 2)(undefined, signal, noProgress)).rejects.toThrow(
      /length mismatch.*npm run build-stellar-streams/,
    );
  });

  it('rejects a meta from before the pick centrelines by name, not as a TypeError at commit', async () => {
    fetch.mock.mockResolvedValue(new Response(JSON.stringify([{ id: 's0', names: ['S0'] }])));
    await expect(
      stellarStreamsMetaFetcher(() => null)(undefined, signal, noProgress),
    ).rejects.toThrow(/predates centrelineMpc/);
  });

  it('accepts a bin with no meta yet', async () => {
    fetch.mock.mockResolvedValue(new Response(bin(), { status: 200 }));
    const payload = await stellarStreamsFetcher(() => null)(undefined, signal, noProgress);
    expect(payload.streamCount).toBe(2);
  });
});

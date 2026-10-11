import { describe, expect, it } from 'vitest';
import { readBodyText } from '../../../src/utils/worker/readBodyText';

const post = (body: string) => new Request('https://x.test/', { method: 'POST', body });

describe('readBodyText', () => {
  it('returns the text of a body within the cap, multibyte included', async () => {
    expect(await readBodyText(post('Malmö ✓'), 100)).toBe('Malmö ✓');
  });

  it('counts bytes, not characters', async () => {
    expect(await readBodyText(post('ö'.repeat(10)), 10)).toBeUndefined();
    expect(await readBodyText(post('ö'.repeat(10)), 20)).toBe('ö'.repeat(10));
  });

  it('gives up on a body past the cap even when no length was declared', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(1_000));
      },
    });
    const request = new Request('https://x.test/', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit);
    expect(await readBodyText(request, 5_000)).toBeUndefined();
  });

  it('returns an empty string for no body', async () => {
    expect(await readBodyText(new Request('https://x.test/', { method: 'POST' }), 10)).toBe('');
  });
});

/**
 * Tests for the hi-res branch of fetchGalaxyBitmap.
 *
 * The `fetchHiRes` path must hit the dataUrl-prefixed
 * `/data/images/famous-hires/<id>.webp`, resize to the caller-supplied
 * `hiResTargetDim`, and return `null` (NOT fall through to SDSS / DSS)
 * on 404 or non-image content type. Famous galaxies without a
 * `full.webp` rely on that null return; falling through would silently
 * pollute the hi-res texture array with a DSS plate at the wrong scale.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchGalaxyBitmap } from '../../../src/utils/network/fetchGalaxyBitmap';
import { GALAXY_ATLAS_SLOT_SIDE } from '../../../src/services/engine/subsystems/galaxyAtlasSubsystem';

// Capture originals so we can restore them and not leak across tests
// (vitest workers are reused across files — see tests/setup/fetchMock.ts
// for the war story).
let originalFetch: typeof fetch | undefined;
let originalCreateImageBitmap: typeof createImageBitmap | undefined;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalCreateImageBitmap = globalThis.createImageBitmap;
  vi.stubEnv('VITE_DATA_BASE_URL', '');
});

afterEach(() => {
  if (originalFetch !== undefined) globalThis.fetch = originalFetch;
  if (originalCreateImageBitmap !== undefined) {
    globalThis.createImageBitmap = originalCreateImageBitmap;
  }
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('fetchGalaxyBitmap — fetchHiRes branch', () => {
  it('loads from dataUrl and resizes to hiResTargetDim', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/webp' },
        }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    // Stub createImageBitmap so it echoes the requested resize dims back —
    // that's how we prove the resize args actually flowed through, not just
    // that the function was called.
    const bitmapSpy = vi.fn(
      async (_blob: Blob, opts?: ImageBitmapOptions) =>
        ({
          width: opts?.resizeWidth ?? 0,
          height: opts?.resizeHeight ?? 0,
          close() {},
        }) as unknown as ImageBitmap,
    );
    globalThis.createImageBitmap = bitmapSpy as unknown as typeof createImageBitmap;

    const bitmap = await fetchGalaxyBitmap({
      ra: 10,
      dec: 20,
      famousId: 'ngc224',
      fetchHiRes: true,
      hiResTargetDim: 1024,
    });

    expect(bitmap).not.toBeNull();
    expect(bitmap!.width).toBe(1024);
    expect(bitmap!.height).toBe(1024);

    // URL must include the `/data/` prefix dataUrl bakes in — that's
    // what R2 sync ships under; dropping the prefix would regress to
    // `/images/...` which doesn't exist on R2.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = String((fetchSpy.mock.calls[0] as unknown[])[0]);
    expect(calledUrl).toBe('/data/images/famous-hires/ngc224.webp');
  });

  it('returns null on 404 without falling back to SDSS or DSS', async () => {
    const fetchSpy = vi.fn(async () => new Response('not found', { status: 404 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    // If the hi-res branch wrongly falls through, createImageBitmap might
    // still get called for an SDSS / DSS blob. Track that.
    const bitmapSpy = vi.fn(
      async () =>
        ({
          width: 0,
          height: 0,
          close() {},
        }) as unknown as ImageBitmap,
    );
    globalThis.createImageBitmap = bitmapSpy as unknown as typeof createImageBitmap;

    const result = await fetchGalaxyBitmap({
      ra: 10,
      dec: 20,
      famousId: 'ngc224',
      fetchHiRes: true,
      hiResTargetDim: 1024,
    });

    expect(result).toBeNull();
    // Exactly one fetch — the hi-res one. No SDSS / DSS fallthrough.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = String((fetchSpy.mock.calls[0] as unknown[])[0]);
    expect(calledUrl).toContain('/data/images/famous-hires/');
    expect(bitmapSpy).not.toHaveBeenCalled();
  });

  it('returns null on non-image content-type without falling back', async () => {
    // R2 sometimes serves an HTML error page with 200 — we treat that the
    // same as a 404 (no SDSS / DSS fallthrough for famous galaxies).
    const fetchSpy = vi.fn(
      async () =>
        new Response('<html>oops</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const bitmapSpy = vi.fn(
      async () =>
        ({
          width: 0,
          height: 0,
          close() {},
        }) as unknown as ImageBitmap,
    );
    globalThis.createImageBitmap = bitmapSpy as unknown as typeof createImageBitmap;

    const result = await fetchGalaxyBitmap({
      ra: 10,
      dec: 20,
      famousId: 'ngc224',
      fetchHiRes: true,
      hiResTargetDim: 1024,
    });

    expect(result).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(bitmapSpy).not.toHaveBeenCalled();
  });
});

describe('fetchGalaxyBitmap — deadline signal', () => {
  // A hung cutout request (SDSS ImgCutout / CDS hips2fits stall) must not
  // leave the PriorityQueue's in-flight entry open forever — see the
  // FETCH_DEADLINE_MS comment in fetchGalaxyBitmap.ts. We can't drive that
  // end-to-end with a fake-timer wait: this vitest environment's
  // AbortSignal.timeout does not observe vi.useFakeTimers (verified —
  // advancing fake timers past the deadline never fires the abort event),
  // so a real-timer version of that test would have to sleep 30 real
  // seconds and would be flaky under CI load. Instead we assert the
  // plumbing that makes the deadline effective: every fetch() call always
  // receives a non-undefined AbortSignal, even when the caller supplies
  // none, proving a call site can't accidentally opt out of the deadline
  // by omitting `signal`.
  it('passes a non-undefined signal to fetch even when the caller supplies none', async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    globalThis.createImageBitmap = vi.fn(
      async () =>
        ({
          width: GALAXY_ATLAS_SLOT_SIDE,
          height: GALAXY_ATLAS_SLOT_SIDE,
          close() {},
        }) as unknown as ImageBitmap,
    ) as unknown as typeof createImageBitmap;

    await fetchGalaxyBitmap({ ra: 10, dec: 20 });

    expect(fetchSpy).toHaveBeenCalled();
    for (const call of fetchSpy.mock.calls) {
      const init = (call as unknown[])[1] as RequestInit | undefined;
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });
});

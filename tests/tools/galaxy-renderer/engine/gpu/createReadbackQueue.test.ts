/**
 * The queue exists to serialize GPU readbacks. Its failure mode is an
 * ORDERING one that no type or GPU-free render test can reach — a race here
 * surfaces only as a WebGPU validation error ('used in submit while
 * mapped'), so these assert the event ORDER a fake device records rather
 * than any returned value.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createReadbackQueue } from '../../../../../tools/galaxy-renderer/src/engine/gpu/createReadbackQueue';

type Fake = {
  device: GPUDevice;
  buffer: (name: string) => GPUBuffer;
  /** Resolve the pending mapAsync for `name`, if any. */
  land: (name: string) => void;
  events: string[];
};

function makeFake(): Fake {
  const events: string[] = [];
  const pending = new Map<string, () => void>();
  const buffers = new Map<string, GPUBuffer>();

  const buffer = (name: string): GPUBuffer => {
    const existing = buffers.get(name);
    if (existing) return existing;
    let mapped = false;
    const buf = {
      mapAsync: () => {
        // The real API rejects a map on an already-mapped buffer; surfacing
        // that as a throw is what makes an ordering regression a test failure
        // rather than a silently different event log.
        if (mapped) throw new Error(`${name}: mapAsync while already mapped`);
        mapped = true;
        events.push(`map:${name}`);
        return new Promise<void>((resolve) => pending.set(name, resolve));
      },
      getMappedRange: () => new ArrayBuffer(8),
      unmap: () => {
        mapped = false;
        events.push(`unmap:${name}`);
      },
      get isMapped(): boolean {
        return mapped;
      },
    } as unknown as GPUBuffer;
    buffers.set(name, buf);
    return buf;
  };

  const device = {
    createCommandEncoder: ({ label }: { label: string }) => ({
      copyTextureToBuffer: (_src: unknown, dst: { buffer: GPUBuffer }) => {
        if ((dst.buffer as unknown as { isMapped: boolean }).isMapped) {
          throw new Error(`${label}: copy into a mapped buffer`);
        }
      },
      finish: () => label,
    }),
    queue: {
      submit: (cmds: string[]) => {
        events.push(`submit:${cmds[0]}`);
      },
    },
  } as unknown as GPUDevice;

  return {
    device,
    buffer,
    land: (name) => {
      pending.get(name)?.();
      pending.delete(name);
    },
    events,
  };
}

const spec = (fake: Fake, label: string) => ({
  label,
  texture: {} as GPUTexture,
  buffer: fake.buffer(label),
  bytesPerRow: 256,
  width: 4,
  height: 2,
  decode: () => label,
});

describe('createReadbackQueue', () => {
  beforeEach(() => {
    vi.stubGlobal('GPUMapMode', { READ: 1 });
  });

  it('does not submit a second request until the first has unmapped', async () => {
    const fake = makeFake();
    const queue = createReadbackQueue(fake.device);
    const a = queue.stream(spec(fake, 'a'));
    const b = queue.stream(spec(fake, 'b'));

    a.request(() => {});
    b.request(() => {});
    await Promise.resolve();
    await Promise.resolve();

    // b must not have submitted yet — a is still holding its map.
    expect(fake.events).toEqual(['submit:a', 'map:a']);

    fake.land('a');
    await vi.waitFor(() => expect(fake.events).toContain('submit:b'));
    expect(fake.events).toEqual(['submit:a', 'map:a', 'unmap:a', 'submit:b', 'map:b']);
  });

  it('skips the GPU work for a request superseded before it starts', async () => {
    const fake = makeFake();
    const queue = createReadbackQueue(fake.device);
    const s = queue.stream(spec(fake, 's'));
    const landed: string[] = [];

    s.request(() => landed.push('first'));
    s.request(() => landed.push('second'));
    s.request(() => landed.push('third'));

    await vi.waitFor(() => expect(fake.events).toContain('map:s'));
    fake.land('s');
    await vi.waitFor(() => expect(landed.length).toBeGreaterThan(0));

    // One readback for three requests, and it is the LAST one's landing that
    // runs — a dragged slider coalesces instead of replaying every frame.
    expect(landed).toEqual(['third']);
    expect(fake.events.filter((e) => e === 'submit:s')).toHaveLength(1);
  });

  it('keeps tokens per-stream, so one stream cannot supersede another', async () => {
    const fake = makeFake();
    const queue = createReadbackQueue(fake.device);
    const a = queue.stream(spec(fake, 'a'));
    const b = queue.stream(spec(fake, 'b'));
    const landed: string[] = [];

    a.request(() => landed.push('a'));
    b.request(() => landed.push('b'));

    await vi.waitFor(() => expect(fake.events).toContain('map:a'));
    fake.land('a');
    await vi.waitFor(() => expect(fake.events).toContain('map:b'));
    fake.land('b');
    await vi.waitFor(() => expect(landed).toHaveLength(2));

    expect(landed).toEqual(['a', 'b']);
  });

  it('unmaps and keeps the stream alive when decode throws', async () => {
    const fake = makeFake();
    const queue = createReadbackQueue(fake.device);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let firstDecode = true;
    const s = queue.stream({
      ...spec(fake, 's'),
      decode: () => {
        if (firstDecode) {
          firstDecode = false;
          throw new Error('bad texels');
        }
        return 's';
      },
    });

    s.request(() => {});
    await vi.waitFor(() => expect(fake.events).toContain('map:s'));
    fake.land('s');
    // Without the try/finally the buffer stays mapped forever and this second
    // request's mapAsync throws — a one-shot error becoming a dead stream.
    await vi.waitFor(() => expect(fake.events).toContain('unmap:s'));

    const landed: string[] = [];
    s.request((v) => landed.push(v));
    await vi.waitFor(() => expect(fake.events).toContain('map:s'));
    fake.land('s');
    await vi.waitFor(() => expect(landed).toEqual(['s']));
    errors.mockRestore();
  });
});

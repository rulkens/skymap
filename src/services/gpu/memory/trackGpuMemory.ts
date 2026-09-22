/**
 * trackGpuMemory — live per-owner GPU byte ledger. Wraps `device.createBuffer`
 * / `createTexture` IN PLACE at construction, so every downstream call site
 * (renderers, tools/ harnesses, all ~223 create sites) is tracked with no
 * per-site change. Owner = the descriptor's `label` when set, else the
 * basename of the first non-ledger stack frame (`ownerFromStack`) — only
 * ~45/223 sites label today, which is why the fallback carries the load.
 *
 * `destroy()` is wrapped to subtract immediately and is idempotent (a second
 * call is a no-op). A `FinalizationRegistry` catches the other path — GC
 * without `destroy()` — and both subtracts the bytes AND counts it under
 * `gcReclaimed`, the leak signal (e.g. surface-tile atlases today). Swap-chain
 * textures (`context.getCurrentTexture()`) are never tracked — they aren't
 * created via `device.createTexture`.
 */

import type { GpuMemoryLedger } from '../../../@types/gpu/memory/GpuMemoryLedger';
import type { GpuMemorySnapshot } from '../../../@types/gpu/memory/GpuMemorySnapshot';
import type { GpuMemoryOwnerTally } from '../../../@types/gpu/memory/GpuMemoryOwnerTally';
import { ownerFromStack } from '../../../utils/gpu/memory/ownerFromStack';
import { textureByteSize } from '../../../utils/gpu/memory/textureByteSize';

// This file's own basename — `ownerFromStack` skips frames here so the owner
// resolves to the actual caller, not the ledger's wrapper.
const LEDGER_BASENAME = 'trackGpuMemory';

export const EMPTY_GPU_MEMORY_SNAPSHOT: GpuMemorySnapshot = { totalBytes: 0, owners: [] };

export function trackGpuMemory(device: GPUDevice): GpuMemoryLedger {
  const owners = new Map<string, GpuMemoryOwnerTally>();

  function rowFor(owner: string): GpuMemoryOwnerTally {
    let row = owners.get(owner);
    if (!row) {
      row = { bytes: 0, count: 0, gcReclaimed: 0 };
      owners.set(owner, row);
    }
    return row;
  }

  function release(owner: string, bytes: number, gc: boolean): void {
    const row = owners.get(owner);
    if (!row) return;
    row.bytes -= bytes;
    row.count -= 1;
    if (gc) row.gcReclaimed += 1;
  }

  // Held value carries owner+bytes so the callback can subtract without a
  // second lookup; the registry unregisters on explicit destroy (below) so a
  // destroyed object's GC never double-subtracts.
  const registry = new FinalizationRegistry<{ owner: string; bytes: number }>(({ owner, bytes }) =>
    release(owner, bytes, true),
  );

  function ownerOf(label: string | undefined): string {
    if (label) return label;
    return ownerFromStack(new Error().stack ?? '', LEDGER_BASENAME) ?? 'unknown';
  }

  // `T extends GPUBuffer | GPUTexture`: both wrappers below share this
  // record/destroy-patch/register sequence, differing only in how bytes and
  // the create call are produced.
  function track<T extends GPUBuffer | GPUTexture>(resource: T, owner: string, bytes: number): T {
    const row = rowFor(owner);
    row.bytes += bytes;
    row.count += 1;

    // Cast the write target: `T extends GPUBuffer | GPUTexture` makes plain
    // `resource.destroy = ...` a union-of-overloads assignment tsc rejects,
    // even though both interfaces declare the identical `(): undefined`.
    let destroyed = false;
    const originalDestroy = resource.destroy.bind(resource);
    (resource as { destroy: () => undefined }).destroy = (): undefined => {
      if (destroyed) return undefined;
      destroyed = true;
      registry.unregister(resource);
      release(owner, bytes, false);
      originalDestroy();
      return undefined;
    };
    registry.register(resource, { owner, bytes }, resource);
    return resource;
  }

  const originalCreateBuffer = device.createBuffer.bind(device);
  device.createBuffer = (descriptor: GPUBufferDescriptor): GPUBuffer =>
    track(originalCreateBuffer(descriptor), ownerOf(descriptor.label), descriptor.size);

  const originalCreateTexture = device.createTexture.bind(device);
  device.createTexture = (descriptor: GPUTextureDescriptor): GPUTexture =>
    track(
      originalCreateTexture(descriptor),
      ownerOf(descriptor.label),
      textureByteSize(descriptor),
    );

  return {
    snapshot(): GpuMemorySnapshot {
      const rows = [...owners.entries()]
        .map(([owner, row]) => ({ owner, ...row }))
        .sort((a, b) => b.bytes - a.bytes);
      return { totalBytes: rows.reduce((sum, row) => sum + row.bytes, 0), owners: rows };
    },
  };
}

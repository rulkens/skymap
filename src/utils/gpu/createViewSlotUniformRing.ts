/**
 * createViewSlotUniformRing — one fixed-size uniform buffer PER view slot, so
 * a renderer's per-frame `writeBuffer` survives a sky-cubemap capture sweep.
 *
 * A sweep draws once per face plus once for the real view, all before one
 * `submit()`, and a recorded draw reads its bound buffer only at submit time
 * — so one shared buffer hands every draw the LAST write (docs/RENDERER.md
 * landmine #1). A ring, not dynamic offsets: the bind-group layouts it binds
 * are shared canonical objects sibling pipelines consume as-is.
 */

import type { ViewSlotUniformRing } from '../../@types/rendering/ViewSlotUniformRing';

/** Slot 0 is the main view; 1..6 are the sky-cubemap's six capture faces. */
export const VIEW_SLOT_COUNT = 7;

export function createViewSlotUniformRing(init: {
  readonly device: GPUDevice;
  readonly label: string;
  readonly byteSize: number;
  readonly layout: GPUBindGroupLayout;
}): ViewSlotUniformRing {
  const { device, label, byteSize, layout } = init;

  const buffers: GPUBuffer[] = [];
  const bindGroups: GPUBindGroup[] = [];
  for (let slot = 0; slot < VIEW_SLOT_COUNT; slot++) {
    const buffer = device.createBuffer({
      label: `${label}-slot${slot}`,
      size: byteSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    buffers.push(buffer);
    bindGroups.push(
      device.createBindGroup({
        label: `${label}-bg-slot${slot}`,
        layout,
        entries: [{ binding: 0, resource: { buffer } }],
      }),
    );
  }

  // Loud on an out-of-range slot rather than a bare `TypeError` out of
  // `queue.writeBuffer` — same discipline as `renderTargets.viewOf`.
  function slotInRange(slot: number): void {
    if (slot < 0 || slot >= VIEW_SLOT_COUNT) {
      throw new Error(`${label}: view slot ${slot} out of range (${VIEW_SLOT_COUNT} slots)`);
    }
  }

  function writeSlot(slot: number, data: BufferSource): void {
    slotInRange(slot);
    device.queue.writeBuffer(buffers[slot]!, 0, data);
  }

  function bindGroupOf(slot: number): GPUBindGroup {
    slotInRange(slot);
    return bindGroups[slot]!;
  }

  function destroy(): void {
    for (const buffer of buffers) buffer.destroy();
  }

  return { writeSlot, bindGroupOf, destroy };
}

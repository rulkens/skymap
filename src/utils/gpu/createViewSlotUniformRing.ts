/**
 * createViewSlotUniformRing — one fixed-size uniform buffer PER view slot
 * (Task 13b, Ruling 7), so a renderer's per-frame `writeBuffer` survives a
 * sky-cubemap capture sweep intact.
 *
 * A capture sweep calls a roster renderer's `draw()` once per face (a
 * synthetic `ReadyFrameContext`) plus once for the real view, ALL before one
 * `submit()`. A single shared buffer keeps only the LAST of those writes —
 * `queue.writeBuffer` calls apply in call order, but every recorded draw only
 * reads its bound buffer's contents at `submit()` time, by which point every
 * write already landed (docs/RENDERER.md landmine #1). Giving each
 * `ctx.viewSlot` its OWN physical buffer + bind group closes the race: a
 * call's write and the draw recorded against it always agree on which bytes
 * are theirs, because no other call ever touches that buffer.
 *
 * Ring-of-buffers, not one buffer + 256-byte-aligned dynamic offsets: the
 * bind-group layouts this ring is built against are shared, canonical
 * objects in several call sites (`FadeUniformsBgl`, `SourceUniformsBgl`) —
 * consumed as-is by sibling pipelines (`galaxyPickRenderer`) that only ever
 * bind slot 0. Making the layout's binding `hasDynamicOffset: true` would
 * force every consumer, including ones with no multi-slot need, to supply an
 * offset at bind time — a shared-type change for a single-caller feature. A
 * private ring needs no layout change at all: 7 slots × ≤176 B is a rounding
 * error in VRAM, so the memory a dynamic-offset scheme would save isn't
 * worth the wider blast radius.
 */

import type { ViewSlotUniformRing } from '../../@types/rendering/ViewSlotUniformRing';

/** Slot 0 is the main view; 1..6 are the sky-cubemap's six capture faces. */
export const VIEW_SLOT_COUNT = 7;

export function createViewSlotUniformRing(init: {
  readonly device: GPUDevice;
  readonly label: string;
  readonly byteSize: number;
  readonly layout: GPUBindGroupLayout;
  /** @default VIEW_SLOT_COUNT */
  readonly slotCount?: number;
}): ViewSlotUniformRing {
  const { device, label, byteSize, layout } = init;
  const slotCount = init.slotCount ?? VIEW_SLOT_COUNT;

  const buffers: GPUBuffer[] = [];
  const bindGroups: GPUBindGroup[] = [];
  for (let slot = 0; slot < slotCount; slot++) {
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
    if (slot < 0 || slot >= slotCount) {
      throw new Error(`${label}: view slot ${slot} out of range (${slotCount} slots)`);
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

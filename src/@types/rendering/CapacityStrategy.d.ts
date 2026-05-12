/**
 * CapacityStrategy — controls how `InstancedQuadRenderer` sizes its
 * per-instance vertex buffer.
 *
 * - `fixed`: preallocate `max * 48` bytes once. Engine guarantees
 *   `instanceCount ≤ max`.
 * - `grow`: lazy allocate on first non-empty draw; reallocate
 *   (destroy + recreate) when `instanceCount` exceeds current
 *   capacity. New capacity is `max(instanceCount, 64)` — the floor
 *   keeps the very first draw from creating an undersized buffer.
 */
export type CapacityStrategy = { kind: 'fixed'; max: number } | { kind: 'grow' };

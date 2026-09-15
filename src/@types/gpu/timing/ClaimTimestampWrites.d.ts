/**
 * ClaimTimestampWrites — a compute step's timing slot, handed over LAZILY.
 *
 * `gpuTimingService.descriptorFor` does not just build a descriptor: it marks
 * the slot consumed for this frame, which is what tells the DebugPanel the row
 * is live. A query set retains the previous write, so a slot claimed by a step
 * that then opened no pass reports whatever ticks it last held — a stale
 * reading indistinguishable from a real one.
 *
 * Compute rows carry their own gates (an empty atmosphere draw list, flow
 * switched off, a field not yet resident), so only the row knows whether a pass
 * opens. It calls this at the moment it opens one, and never otherwise.
 */

export type ClaimTimestampWrites = () => GPUComputePassTimestampWrites | undefined;

/**
 * The per-frame octree stream driver both point families share: observe each stream's
 * epoch, plan its chunks when due (at once on a landing or eviction; every
 * `intervalFrames` for a moved cut or chunks wanted or in flight), and decide the
 * re-cut cadence (a moving cut re-cuts every other frame). The wake is a timer: the
 * fades can still move for `NODE_FADE_MS` after the cut last moved, or while a fetch is out.
 * `settling` is the same timer started by a landing or eviction only, so a still eye
 * settles once its chunks are in and faded, while a moving one never waits on its motion.
 */
import type { OctreeChunkStream } from '../../@types/octree/OctreeChunkStream';
import type { OctreeCutSpec } from '../../@types/octree/OctreeCutSpec';
import type { OctreeFrameDriver } from '../../@types/octree/OctreeFrameDriver';
import { NODE_FADE_MS } from '../../data/octree/octreeNodeFade';
import { planOctreeChunks } from '../../utils/octree/planOctreeChunks';
import { sameOctreeCut } from '../../utils/octree/sameOctreeCut';

export function createOctreeFrameDriver<C extends { readonly count: number }>(
  intervalFrames: number,
): OctreeFrameDriver<C> {
  let anchor: OctreeCutSpec | null = null;
  let changedAtMs = -Infinity;
  let landedAtMs = -Infinity;
  // The pool's LRU clock; any strictly increasing count serves.
  let frameIndex = 0;
  // A landing chunk changes the cut without changing `sameOctreeCut`'s inputs.
  const seenEpoch = new WeakMap<OctreeChunkStream<C>, number>();
  let plannedCut: OctreeCutSpec | null = null;
  let plannedFrame = 0;
  let wantedChunks = false;
  let recutLast = true;
  const observeEpoch = (stream: OctreeChunkStream<C>): boolean => {
    const epoch = stream.epoch();
    if (seenEpoch.get(stream) === epoch) return false;
    seenEpoch.set(stream, epoch);
    return true;
  };
  return {
    reset() {
      plannedCut = null;
    },
    step(nowMs, cut, streams) {
      if (nowMs < changedAtMs) changedAtMs = nowMs;
      if (nowMs < landedAtMs) landedAtMs = nowMs;
      frameIndex++;

      let inFlight = 0;
      let residencyChanged = false;
      if (cut === null) plannedCut = null;
      else {
        for (const { stream } of streams) {
          residencyChanged ||= observeEpoch(stream);
          inFlight += stream.inFlightCount();
        }
        // Between plans the pool keeps its last requests. A landing or eviction re-plans at
        // once; a moved cut, or chunks wanted or in flight, every interval, so a moving eye
        // pays one plan per interval and a stopped one still gets a plan at rest.
        const due =
          plannedCut === null ||
          residencyChanged ||
          (frameIndex - plannedFrame >= intervalFrames &&
            (wantedChunks || inFlight > 0 || !sameOctreeCut(cut, plannedCut)));
        if (due) {
          plannedCut = cut;
          plannedFrame = frameIndex;
          wantedChunks = false;
          for (const { stream, octree } of streams) {
            const { touched, requests } = planOctreeChunks(
              octree,
              cut,
              stream.resident,
              stream.hasFailed,
              stream.slots,
            );
            stream.update(frameIndex, touched, requests);
            wantedChunks ||= requests.length > 0;
          }
          // The update may have enqueued fetches or evicted for them.
          inFlight = 0;
          for (const { stream } of streams) {
            inFlight += stream.inFlightCount();
            residencyChanged ||= observeEpoch(stream);
          }
        }
      }

      // A moving cut re-cuts every other frame: the kept lists still draw about this frame's
      // eye, and a skipped frame's fade time rides the next cut's step. A landing re-cuts at once.
      let moving = false;
      if (cut === null) anchor = null;
      else if (residencyChanged || anchor === null || !sameOctreeCut(cut, anchor)) {
        moving = anchor !== null && !residencyChanged;
        anchor = cut;
        changedAtMs = nowMs;
      }
      const recut = !(moving && recutLast);
      recutLast = recut;
      if (residencyChanged) landedAtMs = nowMs;
      const awake = cut !== null && (nowMs - changedAtMs < NODE_FADE_MS || inFlight > 0);
      const settling = cut !== null && (nowMs - landedAtMs < NODE_FADE_MS || inFlight > 0);
      return { recut, awake, settling, residencyChanged };
    },
  };
}

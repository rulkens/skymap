import type { ClipData } from '../../animation/ClipData';

/**
 * EngineClipHandle — imperative play/stop control for a single Layer-1 clip.
 *
 * This is the live call-site the saga context already owns (`playClip` /
 * `clipPlayer.stop`), re-exposed on the public handle so the dev panel can
 * trigger a clip directly — no tour, no URL gate. The guided tour drives
 * clips through the `startTour` saga; this surface is for playing one clip in
 * isolation (showcase recordings, exercising the stop/cancel path).
 *
 * `play` returns the same Promise the tour saga awaits: it resolves on BOTH
 * clip-end edges — natural completion and `stop()`-driven abort — and never
 * rejects, so a caller can `play(clip).finally(...)` to clear a "now playing"
 * readout without an error boundary.
 *
 * `stop` aborts the active clip immediately (dispatches `endClip`, snaps the
 * clipOpacity channel back to 1, and resolves any in-flight `play` Promise).
 * It is a no-op when no clip is playing.
 */
export type EngineClipHandle = {
  play: (clip: ClipData) => Promise<void>;
  stop: () => void;
};

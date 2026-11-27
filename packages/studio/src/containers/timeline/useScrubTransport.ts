import { useRef } from 'react';
import { useAppStore } from '../../../../../src/store/hooks';
import { paused, played, playheadSet } from '../../session/state/studioSlice';
import { selectPlayheadSec, selectTransport } from '../../session/state/selectors';
import { selectTimeline } from '../../timeline/state/selectTimeline';
import { playFrom } from '../../session/utils/playFrom';
import type { ClipSpan } from '../../../../../src/@types/animation/ClipSpan';
import type { RulerScrub } from '../../timeline/@types/RulerScrub';

/**
 * The transport's side of a ruler gesture. A press while playing pauses for the gesture, so the clip
 * never plays on under a held pointer, and the release resumes from where the head was left (Q-D),
 * by Play's rule (`playFrom`).
 */
export function useScrubTransport(): RulerScrub {
  const store = useAppStore();
  // The loop of a play this gesture paused; undefined when it paused nothing. Gesture-local.
  const resume = useRef<ClipSpan | null | undefined>(undefined);
  return {
    onSeek: (sec) => store.dispatch(playheadSet(sec)),
    onStart: () => {
      const transport = selectTransport(store.getState());
      if (transport.kind === 'running') {
        resume.current = transport.loop;
        store.dispatch(paused());
      }
    },
    onEnd: () => {
      const loop = resume.current;
      resume.current = undefined;
      if (loop === undefined) return;
      const state = store.getState();
      const durationSec = selectTimeline(state)?.durationSec ?? Infinity;
      store.dispatch(
        played({ fromSec: playFrom(selectPlayheadSec(state), durationSec, loop), loop }),
      );
    },
  };
}

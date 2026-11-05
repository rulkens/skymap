/*
 * Flight — the hero. A sticky full-height stage inside a tall track; scrolling moves along the flight without a
 * rest (useFlight) and never changes scroll speed or direction. The stills are the flight at every width (Stops).
 * On a wide screen with a capable connection the film loads after first paint and plays over them; the layout never
 * depends on it, so a film that fails to arrive moves nothing. The page decides the stage once, before first paint
 * (prePaintScript.ts); this island takes over from that state when it hydrates. Without script the same list reads
 * top to bottom as captioned pictures. The words are the page's (home.mdx); the tagline comes as a slot for its
 * line break.
 */
import { createRef, useCallback, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import type { FlightParts } from '../../../../@types/FlightParts';
import type { FlightStopView } from '../../../../@types/FlightStopView';
import { FLIGHT_STOPS } from '../../../../data/flightStops.ts';
import Arrive from './Arrive.tsx';
import styles from './Flight.module.css';
import Intro from './Intro.tsx';
import Spine from './Spine.tsx';
import Stops from './Stops.tsx';
import { useFlight } from './useFlight.ts';
import { TIMELINE } from './Flight.constants.ts';

/** `stops` come from the page (flightStopViews), which reads the facts: they stay out of the island's script. */
type FlightProps = {
  stops: FlightStopView[];
  videoUrl: string;
  tagline: ReactNode;
  /** The scroll hint before the wordmark has gone, and after. */
  hint: string;
  onwardHint: string;
  /** The words after the distance readout's figure. */
  scaleSuffix: string;
  /** The arrival's mark on us, and its words over Open app. */
  here: string;
  invite: string;
};

function Flight({
  stops,
  videoUrl,
  tagline,
  hint,
  onwardHint,
  scaleSuffix,
  here,
  invite,
}: FlightProps) {
  const [shown, setShown] = useState(0);
  const [near, setNear] = useState<ReadonlySet<number>>(() => new Set([0]));
  // One object for the life of the island: the scroll loop holds these elements, not a render's copy.
  const [parts] = useState<FlightParts>(() => ({
    track: createRef(),
    video: createRef(),
    intro: createRef(),
    arrive: createRef(),
    fill: createRef(),
    scale: createRef(),
    hint: createRef(),
    pictures: { current: [] },
    captions: { current: [] },
  }));

  const reach = useCallback(
    (from: number, to: number) =>
      setNear((before) => {
        const next = new Set(before);
        for (let k = Math.max(0, from); k <= Math.min(to, FLIGHT_STOPS.length - 1); k++)
          next.add(k);
        return next.size === before.size ? before : next;
      }),
    [],
  );
  const goTo = useFlight({
    timeline: TIMELINE,
    videoUrl,
    parts,
    onShown: setShown,
    onReach: reach,
  });

  return (
    <section
      className={styles.root}
      // What a feedback note reads to say where in the film it was (flightState in dev/feedback/Feedback).
      data-flight
      // The film is its own sky: the page's star field stays off it (site/StarField).
      data-starless
      data-timeline={JSON.stringify(TIMELINE)}
      style={{ '--units': TIMELINE.units.toFixed(3) } as CSSProperties}
    >
      <div ref={parts.track} className={styles.track}>
        {/* data-opening: the page's opening section, as the first-screen check (`npm run site:fold`) knows it. */}
        <div className={styles.stage} data-opening>
          <Intro ref={parts.intro} tagline={tagline} />
          <Stops stops={stops} near={near} pictures={parts.pictures} captions={parts.captions} />
          {/* Rewritten on every scroll frame, so it is kept from screen readers; the stops' captions carry the same story. */}
          <p ref={parts.scale} className={styles.scale} aria-hidden="true">
            <span className={styles.figure} /> {scaleSuffix}
          </p>
          {/* Stays through the flight and changes its words once the wordmark has gone (`data-onward`). */}
          <p ref={parts.hint} className={styles.hint} aria-hidden="true">
            <span className={styles.opening}>{hint}</span>
            <span className={styles.onward}>{onwardHint}</span>
          </p>
          <video
            ref={parts.video}
            className={styles.film}
            muted
            playsInline
            preload="none"
            tabIndex={-1}
            aria-hidden="true"
          />
          <Arrive ref={parts.arrive} here={here} invite={invite} />
          <Spine stops={stops} shown={shown} fill={parts.fill} onGo={goTo} />
        </div>
      </div>
    </section>
  );
}

export default Flight;

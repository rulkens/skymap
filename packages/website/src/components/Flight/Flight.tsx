/*
 * Flight — the hero. A sticky full-height stage inside a tall track; scrolling
 * moves along the flight without a rest (useFlight) and never changes scroll
 * speed or direction. The stills are the flight at every width (Stops). On a
 * wide screen with a capable connection the film loads after first paint and
 * plays over them; the layout never depends on it, so a film that fails to
 * arrive moves nothing. The page decides the stage once, before first paint
 * (prePaintScript.ts); this island takes over from that state when it hydrates.
 * Without script the same list reads top to bottom as captioned pictures.
 */
import { createRef, useCallback, useState } from 'react';
import type { CSSProperties } from 'react';

import { HERO_MEDIA } from '../../../../../tools/site/heroMediaPlan';
import type { FlightParts } from '../../@types/FlightParts';
import type { FlightStopView } from '../../@types/FlightStopView';
import { FLIGHT_STOPS } from '../../data/flightStops.ts';
import { flightTimeline } from '../../utils/flightTimeline.ts';
import Arrive from './Arrive.tsx';
import styles from './Flight.module.css';
import Intro from './Intro.tsx';
import Spine from './Spine.tsx';
import Stops from './Stops.tsx';
import { useFlight } from './useFlight.ts';

/** `stops` come from the page (flightStopViews), which reads the facts: they stay out of the island's script. */
type FlightProps = { stops: FlightStopView[]; videoUrl: string };

const TIMELINE = flightTimeline(
  FLIGHT_STOPS.map((stop) => stop.atSec),
  HERO_MEDIA.outSec - HERO_MEDIA.inSec,
);

function Flight({ stops, videoUrl }: FlightProps) {
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
      data-timeline={JSON.stringify(TIMELINE)}
      style={{ '--units': TIMELINE.units.toFixed(3) } as CSSProperties}
    >
      <div ref={parts.track} className={styles.track}>
        {/* data-opening: the page's opening section, as the first-screen check (`npm run site:fold`) knows it. */}
        <div className={styles.stage} data-opening>
          <Intro ref={parts.intro} />
          <Stops stops={stops} near={near} pictures={parts.pictures} captions={parts.captions} />
          {/* Rewritten on every scroll frame, so it is kept from screen readers; the stops' captions carry the same story. */}
          <p ref={parts.scale} className={styles.scale} aria-hidden="true" />
          {/* Stays through the flight and changes its words once the wordmark has gone. */}
          <p ref={parts.hint} className={styles.hint} aria-hidden="true">
            Scroll to pull back
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
          <Arrive ref={parts.arrive} />
          <Spine stops={stops} shown={shown} fill={parts.fill} onGo={goTo} />
        </div>
      </div>
    </section>
  );
}

export default Flight;

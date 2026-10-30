/*
 * FilmClock — the clock of a film whose clock ran (a loop with `clockDays`), drawn in the app's own language: the
 * date the frame shows, the speed the film ran at and a track to drag. The film was recorded from `from` over
 * `days` days, evenly, so the date of a frame is its share of the film's length times that span. Dragging holds
 * the film on the frame asked for and lets it run on when let go. Without a film (before it first plays, or for
 * a reader who asked for less motion) it reads the first frame's date and has no track.
 */
import { useEffect, useRef, useState } from 'react';

import { clockRate } from '../../../../utils/clockRate.ts';
import { clockReading } from '../../../../utils/clockReading.ts';
import styles from './FilmClock.module.css';

type FilmClockProps = {
  // The film's first frame, as an ISO instant, and the days its clock ran over the whole film.
  from: string;
  days: number;
  seconds: number;
  film: () => HTMLVideoElement | null | undefined;
  // Called on every drag, so the gallery around it stays on this view.
  onScrub: () => void;
};

const STEPS = 1000;

function FilmClock({ from, days, seconds, film, onScrub }: FilmClockProps) {
  const start = Date.parse(from);
  const readout = useRef<HTMLSpanElement>(null);
  const track = useRef<HTMLInputElement>(null);
  const [scrubbable, setScrubbable] = useState(false);
  const held = useRef(false);
  // The gallery passes a new function each render; the loop reads the latest without starting again.
  const latest = useRef(film);
  latest.current = film;

  useEffect(() => {
    let frame = 0;
    const follow = (): void => {
      const clip = latest.current();
      const share = clip?.duration ? clip.currentTime / clip.duration : 0;
      readout.current!.textContent = clockReading(start + share * days * 86_400_000);
      if (clip?.duration && !held.current) track.current!.value = String(Math.round(share * STEPS));
      setScrubbable(Boolean(clip?.duration));
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [days, start]);

  const hold = (): void => {
    held.current = true;
    film()?.pause();
  };
  const release = (): void => {
    if (!held.current) return;
    held.current = false;
    film()
      ?.play()
      .catch(() => {});
  };

  return (
    <div className={styles.root}>
      <span className={styles.rate}>{clockRate(days, seconds)}</span>
      <input
        ref={track}
        className={styles.track}
        type="range"
        min={0}
        max={STEPS}
        defaultValue={0}
        hidden={!scrubbable}
        aria-label="Drag the clock"
        onPointerDown={hold}
        onKeyDown={hold}
        onPointerUp={release}
        onKeyUp={release}
        onBlur={release}
        onInput={(event) => {
          const clip = film();
          held.current = true;
          if (clip?.duration)
            clip.currentTime = (Number(event.currentTarget.value) / STEPS) * clip.duration;
          onScrub();
        }}
      />
      <span ref={readout} className={styles.date} aria-live="off">
        {clockReading(start)}
      </span>
    </div>
  );
}

export default FilmClock;

/*
 * DiscFilm — a still in a round frame with a loop lying over it. The <video> is made the first time
 * `playing` is true, so a film never played is never fetched, and it shows once it has a frame
 * (`data-shown` on the frame) so the still never gives way to an empty box. While it plays, `--turn`
 * on the frame is how far through the loop it is (0 to 1). `children` sit in the frame, after the picture.
 * `wide` sets a 16:9 film in a plain frame instead of a disc. `turnOn` is the element that gets `--turn`
 * in the frame's place, for something beside the film that moves with it.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode, Ref, RefObject } from 'react';

import { cx } from '../../utils/cx.ts';
import Shot from '../Shot/Shot.tsx';
import styles from './DiscFilm.module.css';

type DiscFilmProps = {
  still: string;
  sizes: string;
  film?: string;
  playing: boolean;
  /** Size, padding and ground of the frame. */
  className?: string;
  screenRef?: Ref<HTMLSpanElement>;
  wide?: boolean;
  turnOn?: RefObject<HTMLElement | null>;
  children?: ReactNode;
};

function DiscFilm({
  still,
  sizes,
  film,
  playing,
  className,
  screenRef,
  wide = false,
  turnOn,
  children,
}: DiscFilmProps) {
  const [started, setStarted] = useState(false);
  const [shown, setShown] = useState(false);
  const disc = useRef<HTMLSpanElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!playing) {
      video.current?.pause();
      return;
    }
    setStarted(true);
    // Rejected when the film is stopped before it starts; nothing to do about it.
    video.current?.play().catch(() => {});
    let frame = 0;
    const follow = (): void => {
      const clip = video.current;
      if (clip?.duration)
        (turnOn?.current ?? disc.current!).style.setProperty('--turn', (clip.currentTime / clip.duration).toFixed(4));
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [playing, started, turnOn]);

  return (
    <span
      ref={disc}
      className={cx(styles.root, wide && styles.wide, className)}
      data-shown={shown ? '' : undefined}
    >
      <span ref={screenRef} className={styles.screen}>
        <Shot id={still} sizes={sizes} alt="" />
        {film && started && (
          <video
            ref={video}
            src={film}
            muted
            loop
            playsInline
            disableRemotePlayback
            tabIndex={-1}
            aria-hidden="true"
            onPlaying={() => setShown(true)}
          />
        )}
      </span>
      {children}
    </span>
  );
}

export default DiscFilm;

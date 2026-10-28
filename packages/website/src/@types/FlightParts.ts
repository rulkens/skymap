import type { RefObject } from 'react';

/**
 * The elements of the Home flight that the scroll moves directly, in the order of the stops: written every
 * frame, so they are not React state. `captions[0]` is empty: the first stop's words are the intro.
 */
export type FlightParts = {
  track: RefObject<HTMLDivElement | null>;
  video: RefObject<HTMLVideoElement | null>;
  intro: RefObject<HTMLDivElement | null>;
  arrive: RefObject<HTMLDivElement | null>;
  fill: RefObject<HTMLElement | null>;
  scale: RefObject<HTMLParagraphElement | null>;
  hint: RefObject<HTMLParagraphElement | null>;
  pictures: RefObject<(HTMLElement | null)[]>;
  captions: RefObject<(HTMLElement | null)[]>;
};

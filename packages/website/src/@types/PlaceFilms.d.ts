import type { RefObject } from 'react';

/** Home's Places films (usePlaceFilms): how they play on this screen, which plays, and the calls that start and stop one. */
export type PlaceFilms = {
  mode: 'off' | 'hover' | 'band';
  current: string | null;
  play: (id: string) => void;
  stop: (id: string) => void;
  /** Each disc's screen, by place, for the band a no-hover screen plays from. */
  screens: RefObject<Map<string, HTMLElement>>;
};

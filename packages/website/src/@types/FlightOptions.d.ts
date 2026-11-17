import type { FlightParts } from './FlightParts';
import type { FlightTimeline } from './FlightTimeline';

/** What Home's flight (useFlight) is driven by: its timeline, its film, its parts, and what it reports. */
export type FlightOptions = {
  timeline: FlightTimeline;
  videoUrl: string;
  parts: FlightParts;
  /** The stop being read changed. */
  onShown: (stop: number) => void;
  /** Stills from `from` to `to` are worth fetching now. */
  onReach: (from: number, to: number) => void;
};

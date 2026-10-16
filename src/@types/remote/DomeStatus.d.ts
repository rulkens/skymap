import type { TourId } from '../animation/tour/TourId';

/** A full snapshot of what the remote renders; `focus.id` is the durable focus id (the URL's `focus` param). */
export type DomeStatus = {
  focus: { id: string } | null;
  tour: { id: TourId; beatIndex: number; beatCount: number; paused: boolean } | null;
  time: {
    simDays: number;
    rateIndex: number;
    direction: 1 | -1;
    paused: boolean;
    mode: 'live' | 'manual';
  };
  toggles: readonly { id: string; label: string; enabled: boolean }[];
};

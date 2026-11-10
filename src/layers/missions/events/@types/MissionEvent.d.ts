/**
 * MissionEvent — one dated event of a sampled-track craft. `iso` is UTC and ends in
 * `T00:00:00.000Z` when the source gives only a day; `label` is the short plain copy.
 * Flybys carry the measured centre distance and the body flown past; `id` keys the caption.
 */
export type MissionEvent = {
  readonly id: string;
  readonly bodyId: string;
  readonly kind: 'launch' | 'flyby' | 'boundary' | 'milestone';
  readonly iso: string;
  readonly label: string;
  readonly closestKm?: number;
  readonly targetId?: string;
};

/**
 * MissionEvent — one dated milestone of a sampled-track craft (launch, flyby, heliopause
 * crossing). `iso` is UTC; `label` is the short plain copy shown for it.
 */
export type MissionEvent = {
  readonly bodyId: string;
  readonly kind: 'launch' | 'flyby' | 'heliopause';
  readonly iso: string;
  readonly label: string;
};

/** The settle callbacks of one DevTools call awaiting its answer. */
export type PendingCdpCall = {
  resolve: (value: never) => void;
  reject: (err: Error) => void;
};

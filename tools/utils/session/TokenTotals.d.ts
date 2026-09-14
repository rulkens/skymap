export type TokenTotals = {
  requests: number;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
  /** input + cacheWrite + cacheRead + output — every token the API charged for. */
  billed: number;
};

/** Import count between two areas: `n` file-level edges, `typeOnly` of them type imports. */
export type AreaEdge = {
  readonly s: string;
  readonly t: string;
  readonly n: number;
  readonly typeOnly: number;
};

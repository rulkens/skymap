/** Martin's instability per area: `ca` incoming cross-area imports, `ce` outgoing, `i = ce/(ca+ce)`. */
export type AreaStability = {
  readonly area: string;
  readonly ca: number;
  readonly ce: number;
  readonly i: number;
};

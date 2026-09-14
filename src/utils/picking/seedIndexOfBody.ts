/**
 * seedIndexOfBody — a body's index into its authored seed table: the durable
 * pick identity the foreground-body `drawPick`s stamp. NOT
 * `@builtin(instance_index)` — the set those layers draw is camera-dependent
 * (the sub-pixel cull, the `STAR_RESOLVE_PX` sphere/point split), so an index
 * into the frame's subset would rename a body the instant a sibling entered or
 * left it; seed order is authored, so this index never moves.
 * −1 (id absent) means SKIP, never stamp: `−1 + PICK_SENTINEL_OFFSET` is `0`,
 * which packs to another body's id band or the no-hit sentinel.
 */
export function seedIndexOfBody(id: string, seeds: readonly { id: string }[]): number {
  return seeds.findIndex((seed) => seed.id === id);
}

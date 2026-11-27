/**
 * assignMeshShadowSlots — which body owns each shadow slot this frame: a chosen body keeps the
 * slot it held (its texels stay valid, no re-render), a newcomer takes the first freed one.
 * `chosen` must fit the slot count.
 */

export function assignMeshShadowSlots(
  previous: readonly (string | null)[],
  chosen: readonly string[],
): (string | null)[] {
  const wanted = new Set(chosen);
  const next = previous.map((id) => (id !== null && wanted.has(id) ? id : null));
  const kept = new Set(next);
  let free = 0;
  for (const id of chosen) {
    if (kept.has(id)) continue;
    while (next[free] !== null) free++;
    next[free] = id;
  }
  return next;
}

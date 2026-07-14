/**
 * findByIdOrThrow — look up an entry by its `id` in an authored table, throwing
 * loudly on a miss.
 *
 * Two identical find-or-throw lookups (the orbital-elements table, the scene
 * bodies registry) each open-coded the same `.find` + `if (!found) throw`
 * dance. They fold into one helper: the `context` label names the calling
 * table so the thrown message stays legible, and the throw fires at module load
 * — a typo in an authored `id` must fail immediately, not silently seed a body
 * at `undefined`/NaN that only misbehaves much later at render time.
 */
export function findByIdOrThrow<T extends { readonly id: string }>(
  list: readonly T[],
  id: string,
  context: string,
): T {
  const found = list.find((entry) => entry.id === id);
  if (!found) throw new Error(`${context}: no entry for id '${id}'`);
  return found;
}

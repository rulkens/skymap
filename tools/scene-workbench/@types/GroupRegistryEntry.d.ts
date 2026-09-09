/** One row of `scenes.json` — the group picker's list, and the pointer to its manifest. */
export type GroupRegistryEntry = {
  readonly id: string;
  readonly name: string;
  readonly manifestUrl: string;
};

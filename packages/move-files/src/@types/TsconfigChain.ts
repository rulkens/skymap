/** What a config and its `extends` chain contribute to alias resolution; each key only if set. */
export type TsconfigChain = {
  readonly paths?: Record<string, string[]>;
  readonly pathsDir?: string; // the config that declared `paths`
  readonly baseUrl?: string;
};

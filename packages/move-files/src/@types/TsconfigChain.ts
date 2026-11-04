/** What a tsconfig and its `extends` chain contribute to alias resolution. */
export type TsconfigChain = {
  readonly paths?: Record<string, string[]>;
  readonly pathsDir: string; // the config that declared `paths`
  readonly baseUrl?: string;
};

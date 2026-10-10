/**
 * What `resolveSiteLink` may ask of the world, injected so the rules can be
 * tested without a build. Paths passed in are posix and relative: `distRel`
 * to the site's output folder, `publicRel` to the repo's `public/`.
 */
export type SiteLinkContext = {
  /** Mount path with both slashes, e.g. `/home/`. */
  base: string;
  hasBuilt: (distRel: string) => boolean;
  hasPublic: (publicRel: string) => boolean;
  idsOf: (distRel: string) => ReadonlySet<string>;
  /** What is wrong with a link into the app, from what follows its `#`; null when nothing is. */
  appProblem: (hash: string) => string | null;
  /** Site paths (no base, trailing slash) of planned pages that do not exist yet. */
  notYetBuilt: readonly string[];
};

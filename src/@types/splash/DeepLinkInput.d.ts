/**
 * Input to `hasDeepLink` — the raw URL hash + search strings.  The caller
 * decides where to read them from (typically `window.location.hash` /
 * `window.location.search`, but the splash hook also feeds fixtures in
 * tests).  `search` may include or omit the leading `?`; `hasDeepLink`
 * normalises it.
 */
export type DeepLinkInput = {
  hash: string;
  search: string;
};

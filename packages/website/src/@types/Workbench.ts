/**
 * One browser tool that is built beside the app, as the Developer workbenches
 * page prints it. `publicPath` is where the published site serves it, for the
 * ones that are published; `script` is the `npm run` name that serves it from
 * the source, on `port` (none for a tool that writes a page and stops).
 * `manual` is its README, a path from the repository's root. The picture is
 * `assets/workbenches/<id>-<width>.avif|webp`, taken by
 * tools/site/shootWorkbench.ts.
 */
export type Workbench = {
  id: string;
  name: string;
  publicPath?: string;
  script: string;
  port?: number;
  manual: string;
  picture: { title: string; caption: string; alt: string; credit?: string };
};

# tools/site

One-shot generators for the website's committed assets and its hero media. Each is run by hand when its input changes.

| Script              | Run                                 | Writes                                                                        |
| ------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| `makeOgImage.ts`    | `npx tsx tools/site/makeOgImage.ts` | `public/og-image.jpg` from `docs/screenshots/cosmic-web.jpg`                  |
| `makeFavicon.ts`    | `npx tsx tools/site/makeFavicon.ts` | `public/apple-touch-icon.png` from `public/favicon.svg`                       |
| `buildHeroMedia.ts` | `npm run site:media -- [recording]` | the scrub video and the poster and section stills, from the owner's recording |

## Hero media

`npm run site:media` cuts the Home flight from `recordings/earthUniverseLoop-3840x2160-60fps-20260817-152155-60M.mp4` (needs `ffmpeg` on `PATH`). `recordings/` is gitignored and exists only in the main checkout, so a worktree run passes that file's absolute path as the argument.

- **Video** goes to `public/data/site/<videoFile>`, gitignored: never commit it. It is 1280x720, 24 fps, H.264, no audio, `+faststart`, a keyframe every second so scroll seeks stay cheap. Cut points, size, CRF and the measured trade-offs are in `heroMediaPlan.ts`.
- **Stills** go to `packages/website/src/assets/` and are committed, so the page is complete without the video.
- **Versioning**: the production copy is served `immutable`. New bytes need a new `videoFile` name (bump `v1`); the site reads the name from the plan.
- **Upload** is the owner's step: see "Site media" in `docs/DEPLOY.md`.
- After changing a cut point, re-check the stop timings in `packages/website/src/data/flightStops.ts` by looking at frames.

## Link check

`npm run site:links` (after `npm run site:build`, and in CI) walks `dist/home/**/*.html` and resolves every internal `href`, `src` and `srcset` candidate: base-prefixed pages and files against the build, root-absolute shared files (`/fonts`, `/images/featured`, `/favicon.svg`) against the repo's `public/`, `/` as the app, and `#anchors` against the target page's ids. Links to planned pages that do not exist yet are listed in `notYetBuilt.ts` and reported as pending; the check fails if a listed page now exists, so the PR that builds a page deletes its row.

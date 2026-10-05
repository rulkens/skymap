# tools/site

One-shot generators for the website's committed assets and its hero media. Each is run by hand when its input changes.

| Script                 | Run                                       | Writes                                                                          |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| `makeOgImage.ts`       | `npx tsx tools/site/makeOgImage.ts`       | `public/og-image.jpg` from `docs/screenshots/cosmic-web.jpg`                    |
| `makeFavicon.ts`       | `npx tsx tools/site/makeFavicon.ts`       | `public/apple-touch-icon.png` from `public/favicon.svg`                         |
| `buildHeroMedia.ts`    | `npm run site:media -- [recording]`       | the flight's stills (one pair per stop) and its scrub video, from the recording |
| `subsetDisplayFont.ts` | `npx tsx tools/site/subsetDisplayFont.ts` | the site's subset of Cormorant Garamond (needs `pyftsubset`)                    |

## Hero media

`npm run site:media` cuts the Home flight from `recordings/earthUniverseLoop-3840x2160-60fps-20260817-152155-60M.mp4` (needs `ffmpeg` on `PATH`). `recordings/` is gitignored and exists only in the main checkout, so a worktree run passes that file's absolute path as the argument.

- **Stills** are the flight at every width, so they are committed: `packages/website/src/assets/flight/<stop id>-landscape.avif` (1600 px wide) and `<stop id>-portrait.avif` (a 720x1280 crop for upright screens), one pair per row of `packages/website/src/data/flightStops.ts`, cut at that row's `atSec`. A row's `portraitX` moves the crop sideways; `portraitZoom` below 1 widens it and pads with black (only for a frame with black edges). The site derives the smaller widths and the WebP fallbacks at build. About 2 MB for nine stops.
- **Video** goes to `public/data/site/<videoFile>`, gitignored: never commit it. It is 1280x720, 24 fps, H.264, no audio, `+faststart`, a keyframe every second so scroll seeks stay cheap. Cut points, size, CRF and the measured trade-offs are in `heroMediaPlan.ts`. An existing file is kept, not re-cut: delete it or bump the name.
- **Stop times are whole film frames** (multiples of 1/24 s): at a stop the film rests on the frame its still was cut from, and the page swaps in the sharper still. Change a time and re-run the tool, then look at the page.
- **Versioning**: the production copy is served `immutable`. New bytes need a new `videoFile` name (bump `v1`); the site reads the name from the plan.
- **Upload** is the owner's step: see "Site media" in `docs/DEPLOY.md`.
- After changing a cut point, re-check every stop's name against its still: each name must be something drawn or labelled in that frame.

## Link check

`npm run site:links` (after `npm run site:build`, and in CI) walks `dist/home/**/*.html` and resolves every internal `href`, `src` and `srcset` candidate: base-prefixed pages and files against the build, root-absolute shared files (`/fonts`, `/images/featured`, `/favicon.svg`) against the repo's `public/`, `/` as the app, and `#anchors` against the target page's ids. Links to planned pages that do not exist yet are listed in `notYetBuilt.ts` and reported as pending; the check fails if a listed page now exists, so the PR that builds a page deletes its row.

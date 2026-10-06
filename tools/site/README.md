# tools/site

One-shot generators for the website's committed assets and its hero media. Each is run by hand when its input changes.

| Script                 | Run                                        | Writes                                                                          |
| ---------------------- | ------------------------------------------ | ------------------------------------------------------------------------------- |
| `makeOgImage.ts`       | `npx tsx tools/site/makeOgImage.ts`        | `public/og-image.jpg` from `docs/screenshots/cosmic-web.jpg`                    |
| `makeFavicon.ts`       | `npx tsx tools/site/makeFavicon.ts`        | `public/apple-touch-icon.png` from `public/favicon.svg`                         |
| `buildHeroMedia.ts`    | `npm run site:media -- [recording]`        | the flight's stills (one pair per stop) and its scrub video, from the recording |
| `shootSiteShots.ts`    | `npm run site:shots -- --url <app server>` | every picture in the shot manifest, AVIF and WebP, and the link-preview card    |
| `shootSiteLoops.ts`    | `npm run site:loops -- --url <app server>` | every film in the loop manifest, H.264 in MP4                                   |
| `subsetDisplayFont.ts` | `npx tsx tools/site/subsetDisplayFont.ts`  | the site's subset of Cormorant Garamond (needs `pyftsubset`)                    |

## Hero media

`npm run site:media` cuts the Home flight from `recordings/earthUniverseLoop-3840x2160-60fps-20260817-152155-60M.mp4` (needs `ffmpeg` on `PATH`). `recordings/` is gitignored and exists only in the main checkout, so a worktree run passes that file's absolute path as the argument.

- **Stills** are the flight at every width, so they are committed: `packages/website/src/assets/flight/<stop id>-landscape.avif` (1600 px wide) and `<stop id>-portrait.avif` (a 720x1280 crop for upright screens), one pair per row of `packages/website/src/data/flightStops.ts`, cut at that row's `atSec`. A row's `portraitX` moves the crop sideways; `portraitZoom` below 1 widens it and pads with black (only for a frame with black edges). The site derives the smaller widths and the WebP fallbacks at build. About 2 MB for nine stops.
- **Video** goes to `public/data/site/<videoFile>`, gitignored: never commit it. It is 1280x720, 24 fps, H.264, no audio, `+faststart`, a keyframe every second so scroll seeks stay cheap. Cut points, size, CRF and the measured trade-offs are in `heroMediaPlan.ts`. An existing file is kept, not re-cut: delete it or bump the name.
- **Stop times are whole film frames** (multiples of 1/24 s): at a stop the film rests on the frame its still was cut from, and the page swaps in the sharper still. Change a time and re-run the tool, then look at the page.
- **Versioning**: the production copy is served `immutable`. New bytes need a new `videoFile` name (bump `v1`); the site reads the name from the plan.
- **Upload** is the owner's step: see "Site media" in `docs/DEPLOY.md`.
- After changing a cut point, re-check every stop's name against its still: each name must be something drawn or labelled in that frame.

## Shots

`npm run site:shots -- --url http://localhost:<port>` takes every row of `packages/website/src/data/siteShots.ts` from a running app (this checkout's `npm run dev`, with catalogue data: see the `link-data` skill) and writes it to `packages/website/src/assets/shots/<id>-<width>.avif` and `.webp`, which are committed. Nothing is resized at build: the pages read those files by id.

- A deep link carries no settings, so a row's `settings` lists what the runner changes after the link has loaded (labels off, a layer on, a lens). `tools/site/utils/siteShotActions.ts` turns them into store actions; `npm run shot` itself is untouched.
- Two settings change what is photographed instead of the scene. `ui: true` loads the link without `?cinema` and takes the whole page, the app's interface included, where every other row is the canvas alone. `searchFor: 'Jupiter'` (with `ui`) opens the search with the `/` key and types that text before the shot. `crop` keeps one part of the frame, for a phone's cut of a wide interface shot; the master stays whole.
- Each row is shot at twice its `size` and kept as a PNG in `data/shots/site/` (gitignored). `--from-masters` re-encodes from those, for a change of widths or quality; `--only id,id` limits a run.
- The last step sets the link-preview card (`packages/website/src/assets/og-card.jpg`) from the `og-card` row, in the browser so the wordmark is the repo's Cormorant.
- Look at every picture after a run. Surface imagery streams in late (`settleMs`), and `tour-cosmic-web` is taken from a tour that keeps turning, so its framing differs a little each time.
- Budget: at most about 400 KB for a row's largest file. The runner prints each file's size.

## Loops

`npm run site:loops -- --url http://localhost:<port>` records every row of `packages/website/src/data/siteLoops.ts` from a running app and writes it to `packages/website/src/assets/loops/<id>.mp4` (H.264), which is committed: the files are small, ship with the site and need no upload. A loop is the short silent film inside a place's disc on Home; the page fetches one only when a visitor points at that place.

- A row names the shot it starts from (`shot`), so the film opens on the picture it lies over, and a `motion`. `orbit` takes the camera once round its target with the clock stopped; `swayDeg` swings it that far to each side and back; `clockDays` leaves the camera alone and runs the clock, which must bring the scene back to its start (Earth: one turn against the stars, 0.99727 days). All three end where they began, so the film repeats without a seam.
- The runner moves the camera or the clock one step, draws a frame and reads the canvas, so a slow frame costs time and never smoothness. Frames are kept as PNGs in `data/shots/site/loops/<id>/` (gitignored); `--from-masters` re-encodes from those, `--only id,id` limits a run. Needs `ffmpeg` with `libx264`.
- Size, frame rate, CRF and the cap are in `siteLoopPlan.ts`, with the measurement that chose H.264 over AV1 (at these sizes AV1 turns the coloured stars grey). A file over the cap is encoded again at a higher CRF until it fits; the runner prints each file's size and the CRF it ended on, and fails if a file cannot be brought under.
- What costs bytes is every pixel changing: a full orbit of a dense field of points (Laniakea) is 1.8 MB at the starting CRF, a sway of 5 degrees fits the cap. Choose the motion before raising the cap.
- Look at each film after a run: a camera orbit passes the night side of a planet, which is true and dark.

## Link check

`npm run site:links` (after `npm run site:build`, and in CI) walks `dist/home/**/*.html` and resolves every internal `href`, `src` and `srcset` candidate: base-prefixed pages and files against the build, root-absolute shared files (`/fonts`, `/images/featured`, `/favicon.svg`) against the repo's `public/`, `/` as the app, and `#anchors` against the target page's ids. Links to planned pages that do not exist yet are listed in `notYetBuilt.ts` and reported as pending; the check fails if a listed page now exists, so the PR that builds a page deletes its row.

## First-screen check

`npm run site:fold -- --url http://localhost:<port>/home/` opens every page of a running website (`npm run dev --workspace @skymap/website`) in the windows of `foldSizes.ts` and fails when a page's opening section does not fit the first screen. Run it after changing a header, its copy or its picture; it needs a browser and a server, so CI does not run it.

- The opening section is the one element marked `data-opening`. `PictureBand` (with `gap="none"`), `DiscBand` and the Home flight set it; a page without one fails.
- Wide windows: the whole section ends inside the window, the picture's label included. Phones (the rows marked `phone`): the title and the lead are inside and the picture has begun; its label may be below.
- The rule itself is `utils/foldVerdict.ts`. The room comes from `--first-screen` in the site's `site.css`.

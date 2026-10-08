# Loadtime — cold-load milestones on a throttled connection

`npm run loadtime` builds the production bundle, serves it with production's wire sizes, and loads
it in headless Chromium at a phone viewport (390×844, DPR 3, so the `small` data tier) under a
throttled network and CPU. It prints one row per network profile on stdout, in seconds since
navigation start.

```bash
npm run loadtime                                  # 3g, slow-4g, fast-4g
npm run loadtime -- --profile slow-4g --rebuild   # one profile, fresh build
npm run loadtime -- --link '#focus=body-saturn'   # a deep link: no splash
npm run loadtime -- --filmstrip data/shots/load   # screenshots at 1, 2, 4, 8, 15, 30 s
npm run loadtime -- --serve --rebuild             # serve the build at https://localhost:4520 to try by hand
```

## Milestones

| column       | meaning                                                                  |
| ------------ | ------------------------------------------------------------------------ |
| `fcp`        | First contentful paint: the visitor sees something other than black.     |
| `mounted`    | React rendered into `#root`: the bundle has downloaded and run.          |
| `firstFrame` | The engine's first `getCurrentTexture()` call: the canvas is drawing.    |
| `ctaReady`   | The splash's Explore button is enabled. Never set on a splash-less link. |
| `loaded`     | `window.__skymap.ready`: every boot download has settled.                |

A milestone not reached within `--timeout` prints as `>90`.

## Flags

| flag                | default                  | meaning                                                      |
| ------------------- | ------------------------ | ------------------------------------------------------------ |
| `--profile <name>`  | `3g` `slow-4g` `fast-4g` | Repeatable. See `networkProfiles.ts`; `none` is unthrottled. |
| `--link <suffix>`   | none                     | Appended to the URL: a `?query` and/or `#hash`.              |
| `--timeout <sec>`   | `90`                     | How long to wait for `loaded` per profile.                   |
| `--filmstrip <dir>` | off                      | Writes `<dir>/<profile>/<NN>s.jpg`.                          |
| `--rebuild`         | off                      | Rebuild `tools/loadtime/.build` instead of reusing it.       |

## Reading the numbers

- **Pass `--rebuild` after any source change.** Without it the tool reuses the last build and
  measures stale code.
- Every profile also throttles the CPU 4×, which is roughly a mid-range phone against a desktop.
- The server gzips what production gzips (the shell's text assets, and data files per
  `tools/deploy/r2/shouldGzipOnWire.ts`). It serves everything from one origin, so the extra
  connection to the R2 data host is not in the numbers, and Cloudflare's Brotli would make the
  chunks a little smaller than gzip does.
- With a mkcert pair in `.certs/` (`mkdir -p .certs && cd .certs && mkcert localhost`) the server
  speaks HTTP/2 over TLS, as production does. Without one it falls back to HTTP/1.1 and says so;
  its six-connection limit then queues the chunks, which production never does.
- One run per profile. Throttled runs repeat to within about 0.2 s; rerun before reading anything
  into a smaller difference.

## Trying the build by hand

`--serve` skips the measuring and keeps the server up on a fixed port, so the origin's
localStorage (the splash's seen flag) survives restarts. Open it in Chrome and throttle in
DevTools. The dev server is no stand-in for this: it serves hundreds of unbundled modules, so a
throttled load there says nothing about production.

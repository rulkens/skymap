# Shot — PNG of any deep link

`npm run shot` opens each link in headless Chromium, waits for the app to settle on it, and writes
a PNG of what the app shows. It prints one absolute path per shot on stdout and everything else
on stderr.

## Usage

```bash
npm run shot -- 'focus=body-saturn' --url http://localhost:5174   # against your dev server
npm run shot -- 'https://skymap.example/?dome#focus=body-saturn&t=1' --url http://localhost:5174
npm run shot -- 'focus=body-saturn'                               # starts its own dev server
npm run shot -- 'focus=body-saturn' --build                       # production build + preview
```

A link is a full share URL, a bare hash body (`focus=…`, with or without `#`), or `?query#hash`.
Origin and path are dropped: the shot always comes from the server the tool talks to. Several
links make several shots in one run.

## Flags

| flag              | default    | meaning                                                              |
| ----------------- | ---------- | -------------------------------------------------------------------- |
| `--url <base>`    | none       | Reuse a running server; never started or stopped. No query or hash.  |
| `--build`         | off        | Build once into `tools/shot/.build` and serve it. Conflicts `--url`. |
| `--out <file>`    | see below  | Output file; one link only.                                          |
| `--size WxH`      | `1600x900` | Viewport in CSS pixels.                                              |
| `--dpr <n>`       | `2`        | Device pixel ratio; the PNG is size × dpr.                           |
| `--hide-ui`       | off        | Adds `cinema` to the link's query unless it is already there.        |
| `--hide-labels`   | off        | Turns every label off before the shot.                               |
| `--timeout <sec>` | `30`       | How long to wait for the link to settle.                             |

With neither `--url` nor `--build` the tool runs `vite` on a free port. **In a worktree, pass
`--url`** with your own server's `Local:` port, or the shot comes from another branch.

## Output

Shots land in `data/shots/<subject>-<YYYYMMDD-HHMMSS>.png` (local time, gitignored). The subject is
the first of `focus`, `exhibit`, `tour`, `clip` in the hash, else `shot`; a second shot of the same
subject in one run gets `-2`, `-3`, ….

## Timeouts and exit code

A link that does not settle within `--timeout` still gets a PNG of whatever is on screen, with a
notice on stderr. A link whose boot throws is reported on stderr and the remaining links still run.
The exit code is 1 if any shot timed out, errored or wrote no file; page console errors alone do
not change it.

## Wrong-checkout warning

If the server reports a different checkout than the one the tool runs from, a warning naming both
paths goes to stderr. A production build reports none. `npm run perf` prints the same warning.

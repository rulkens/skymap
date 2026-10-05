# Shot — screenshot of any deep link

`npm run shot` opens each link in headless Chromium, waits for the app to settle on it, and writes
a JPEG (or PNG) of what the app shows. It prints one absolute path per shot on stdout and everything else
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

| flag              | default    | meaning                                                             |
| ----------------- | ---------- | ------------------------------------------------------------------- |
| `--url <base>`    | none       | Reuse a running server; never started or stopped. No query or hash. |
| `--build`         | off        | Rebuild into `tools/shot/.build` and serve it. Conflicts `--url`.   |
| `--out <file>`    | see below  | Output file; one link only.                                         |
| `--size WxH`      | `1600x900` | Viewport in CSS pixels.                                             |
| `--dpr <n>`       | `2`        | Device pixel ratio; the image is size × dpr.                        |
| `--png`           | off        | Lossless PNG instead of the default JPEG (quality 90).              |
| `--hide-ui`       | off        | Adds `cinema` to the link's query unless it is already there.       |
| `--hide-labels`   | off        | Turns every label off before the shot.                              |
| `--timeout <sec>` | `30`       | How long to wait for the link to settle.                            |

With neither `--url` nor `--build` the tool runs `vite` on a free port from its own checkout.

`--hide-labels` also hides the selection ring and structure markers (the passes in
`tools/utils/capture/hiddenPasses.ts`). A relative `--out` and `data/shots/` resolve against the
project root, where `npm run` starts the tool.

## Output

Shots land in `data/shots/<subject>-<YYYYMMDD-HHMMSS>.jpg` (`.png` under `--png`; local time, gitignored). The subject is
the first of `focus`, `exhibit`, `tour`, `clip` in the hash, else `shot`; a second shot of the same
subject in one run gets `-2`, `-3`, ….

An `--out` file ending in `.png` is written as PNG without `--png`; any other name is JPEG, and
`--png` with such a name is an error.

## Capture path

Before shooting, the tool awaits `window.__skymap.settled()`: it resolves after the first frame
with no fade or label animation running (always at least one frame, never times out). Auto-rotate
and a playing clock do not hold it back.

With `--hide-ui` the image is read straight from the WebGPU canvas (`toBlob`, in the same task as a
fresh frame, since a presented WebGPU canvas is cleared), so no page chrome can leak in; otherwise,
and whenever that read fails, it is a Playwright page screenshot.

## Timeouts and exit code

A link that does not settle within `--timeout` still gets an image of whatever is on screen, with a
notice on stderr. A link whose boot throws is reported on stderr and the remaining links still run.
The exit code is 1 if any shot timed out, errored or wrote no file; page console errors alone do
not change it.

## Wrong-checkout warning

If the server reports a different checkout than the one the tool runs from, a warning naming both
paths goes to stderr. A production build reports none. `npm run perf` prints the same warning.

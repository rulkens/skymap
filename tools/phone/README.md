# Phone — on-device checks on an Android phone

`npm run phone` drives Chrome or Brave on an Android phone plugged in over USB: it opens deep links,
takes screenshots, tabulates what the page downloads and records frame traces. The DevTools
connection rides `adb forward`; the page and its data come over WiFi from an HTTPS server on this
Mac's LAN address.

## Setup, once per session

1. USB debugging on, phone plugged in, the browser open. `npm run phone -- devices` should list the
   phone, a `chrome_devtools_remote` socket and the browser version.
2. A server the phone can reach:
   - **Production build:** `npm run phone -- serve --build` (leave it running; Ctrl-C stops it).
     Builds into `.phone/dist`, serves `https://<lan-ip>:4443`.
   - **Dev server:** `SKYMAP_HTTPS=1 npm run dev`, then pass its `Network:` URL as `--url` to every
     command. `npm run phone -- serve` (no `--build`) mints the cert and prints these lines.

## Commands

```bash
npm run phone -- devices                                  # adb devices, sockets, browser, tab count
npm run phone -- serve --build [--port 4443]              # HTTPS LAN preview of a production build
npm run phone -- open 'focus=body-saturn'                 # new tab at the link; prints its id
npm run phone -- shot                                     # screenshot the last tab
npm run phone -- shot 'focus=body-saturn' --wait 15000    # new tab, wait, screenshot
npm run phone -- tap '[aria-label=Search]'                # touch an element (or x,y in CSS px) on the last tab
npm run phone -- swipe 200,780 200,300 --ms 400           # drag between two CSS-pixel points
npm run phone -- net 'focus=body-saturn' --for 20000      # cold load: /data/ requests + console
npm run phone -- trace 'tour=long-way-out' --for 5000     # frame-time summary + raw trace
```

A link is anything `npm run shot` takes: a share URL, a bare hash body or `?query#hash`. Its origin
is dropped; the page always comes from `--url`, which defaults to `https://<lan-ip>:<--port>`.

| flag          | default      | meaning                                                                       |
| ------------- | ------------ | ----------------------------------------------------------------------------- |
| `--url <o>`   | LAN `serve`  | Origin of the server the phone loads from. No query or hash.                  |
| `--port <n>`  | `4443`       | Port `serve --build` listens on, and of the default `--url`.                  |
| `--build`     | off          | `serve` only: build and serve; without it `serve` prints the dev recipe.      |
| `--wait <ms>` | 10000 / 0    | `shot`, `trace`: wait after loading a link (10 s), or before a bare shot (0). |
| `--for <ms>`  | 15000 / 5000 | How long `net` listens (15 s) and `trace` records (5 s).                      |
| `--ms <ms>`   | 300          | `swipe` only: how long the finger drags.                                      |
| `--out <f>`   | see below    | `shot` only: output file.                                                     |

`tap` and `swipe` act on the last tab (or load a link in a new one first, then wait `--wait`, default
10 s) and print what they touched; chain `tap … && shot` on the same tab. A selector is resolved to its
box centre through the DOM domain, and touches are `Input.dispatchTouchEvent`: real pointer events and
native scrolling, in CSS pixels. A selector that matches nothing, or has no box, exits 1.

`open` and `shot <link>` make a new tab. `net` and `trace` reuse the last tab the tool used (kept in
`.phone/target`) and load the link there, or reload it when no link is given; with no such tab and
a link they make one. Every tab the tool attaches to ignores certificate errors and is brought to
the front: a background tab draws nothing.

## Output

- `shot`: `data/shots/phone-<subject>-<YYYYMMDD-HHMMSS>.jpg`, named like `npm run shot` from the
  tab's own URL. The path goes to stdout.
- `net`: one row per directory and outcome (`200`, `404`, `FAILED net::ERR_…`, `pending` when the
  window closed first): request count, MB on the wire, directory with its origin. `200 text/html`
  means a missing file: Vite answers it with `index.html`. Then the first 20
  console errors, warnings and uncaught exceptions. The cache is disabled for the load.
- `trace`: the raw trace in `.phone/traces/trace-<time>.json` (open it in DevTools' Performance
  panel), and a summary of the app's `requestAnimationFrame` callbacks: count, median and p95
  interval between them, median and p95 callback duration.

## Reading a trace summary

- Frames are `FireAnimationFrame` events on the renderer thread that ran the most of them; other
  tabs in the browser-wide trace drop out. Validated against a desktop Chromium trace; on the phone
  the raw trace is the ground truth if a summary looks wrong.
- The engine renders on demand. On a still scene there are few or no rAF callbacks and the interval
  measures idleness, not cost: trace a moving pose (a tour, auto-rotate, a playing clock). Fewer
  than 3 frames prints no summary at all.
- The callback duration is main-thread time only; GPU time on the phone is in the raw trace's `gpu`
  categories, which the summary does not read.

## Traps

- **The R2 host rejects a LAN origin (CORS).** `serve --build` builds with `VITE_DATA_BASE_URL=/`;
  a plain `vite build` + `vite preview` fails every data fetch with `net::ERR_FAILED`.
- **`public/data` is 2.8 GB.** The build never copies `public/`; each top-level entry is symlinked
  into `.phone/dist` after every build (`emptyOutDir` deletes the links). A checkout with no
  `public/data` answers every data fetch with `index.html`: run `/link-data`.
- **WebGPU needs a secure context.** A LAN IP is one only over HTTPS. The cert is
  `.certs/<lan-ip>+1.pem`, minted with mkcert when missing; the phone need not trust the CA.
- **Never `adb reverse` the data.** Catalog downloads over it once took the phone's adbd offline.
- **`Runtime.evaluate` can hang on the phone,** so the tool reads screenshots, network events and
  traces and the DOM domain only (selectors, input), and every DevTools call has a timeout.
- **Chrome and Brave share the `chrome_devtools_remote` socket.** With both running, the forward
  reaches one of them; `devices` prints which browser answered.

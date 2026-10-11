---
name: phone
description: Use for anything checked on the user's Android phone (OnePlus, Brave or Chrome over USB) — an on-device eye check, a phone screenshot, "why is the phone blank / missing data", phone frame times, or a mobile-only bug. Triggers like "/phone", "check it on the phone", "shoot it on my phone", "what does the phone download", "trace the phone". Replaces hand-written CDP scripts with `npm run phone`.
---

# /phone — on-device checks without custom scripts

`npm run phone -- <command>` covers what used to need a fresh CDP script each time. Full reference:
[`tools/phone/README.md`](../../../tools/phone/README.md). Never write a one-off adb/CDP script for
something a command below does; extend the tool instead.

## Procedure

1. `npm run phone -- devices`: the phone is listed, a `chrome_devtools_remote` socket exists and a
   browser answers. If not, ask the user to unlock the phone and open the browser.
2. A server the phone can reach, in the background:
   - production behaviour, data loading, load times: `npm run phone -- serve --build`
     (`https://<lan-ip>:4443`); rebuild after every source change.
   - quick visual checks during development: `SKYMAP_HTTPS=1 npm run dev`, then pass its `Network:`
     URL as `--url` to every command.
   In a worktree, run `/link-data` first or every data file is missing.
3. The command for the question:

| question                           | command                                          |
| ---------------------------------- | ------------------------------------------------ |
| what does the phone show?          | `npm run phone -- shot '<link>' [--wait 15000]`  |
| what does it download, what fails? | `npm run phone -- net '<link>' [--for 20000]`    |
| how smooth is it?                  | `npm run phone -- trace '<link>' [--for 5000]`   |
| leave it open for the user         | `npm run phone -- open '<link>'`                 |

`shot`, `net` and `trace` without a link reuse the last tab the tool used.

## One link per check

Every phone eye check gets its own deep link (`#focus=body-<id>&…`) and its own dash check: the
`shot` image attached, the link beside it, the verdict left to the user. Never a bare origin, never
"open the app and navigate to …".

## Traps

| trap                                       | symptom                                     | what the tool does                                  |
| ------------------------------------------ | ------------------------------------------- | --------------------------------------------------- |
| R2 host rejects a LAN origin (CORS)        | every data fetch `net::ERR_FAILED`          | `serve --build` builds with `VITE_DATA_BASE_URL=/`  |
| `public/data` is 2.8 GB                    | a build that copies it for minutes          | `copyPublicDir: false`, then symlinks every entry   |
| `emptyOutDir` wipes the symlinks           | data 404s after a rebuild                   | relinks after every build                           |
| missing data file under Vite               | `200 text/html` rows in `net`               | flags HTML answers under `/data/`                   |
| WebGPU needs a secure context              | blank canvas, `navigator.gpu` undefined     | HTTPS with `.certs/<lan-ip>+1.pem`, minted if absent |
| mkcert CA not trusted on the phone         | certificate warning page                    | ignores cert errors on every tab it attaches        |
| `adb reverse` carrying catalog downloads   | phone's adbd goes offline                   | WiFi for data; only DevTools rides USB              |
| `Runtime.evaluate` hangs on the phone      | a command that never returns                | reads screenshots, network events, traces; timeouts |
| background tab                             | no frames, stale screenshot                 | brings the tab to front                             |
| render-on-demand engine                    | sparse frames, huge intervals on a still scene | trace a moving pose (tour, auto-rotate, clock)   |
| Chrome and Brave share the DevTools socket | the wrong browser answers                   | `devices` prints which one did                      |

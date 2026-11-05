# Faster `npm run shot`

Measured 2026-10-05 on the dev server (Saturn, 1600×900 DPR 2). Parked by the user: the tool is
usable as shipped.

## Where one shot's 4.8–5.3 s goes

| Step                                        | Time                          |
| ------------------------------------------- | ----------------------------- |
| `npm` + `tsx` + the tool's imports          | 0.60 s (0.45 s without `npm`) |
| Chromium launch + new page                  | 0.45 s                        |
| Page load until `window.__skymap` exists    | 0.6–0.85 s                    |
| Subject arrived (page clock)                | ~0.8–1.0 s                    |
| All loads finished (page clock)             | 2.5–2.9 s                     |
| `READY_STABLE_MS` idle wait                 | 1.0 s                         |
| Capture (JPEG)                              | 0.08–0.3 s                    |

Boot is decode-bound, not network-bound: with all 123 MB of data served from a warm disk cache the
loads finished no sooner, and a production build did not shorten body views. Eight links take 39 s in
sequence, 29 s re-navigating one page, 17–18 s with 2–4 parallel contexts, and 37 s with 8.

## Options, by payoff per line

1. Shorten the 1 s idle wait for shots (up to −1 s per shot). It guards against "no load in flight"
   being briefly true before the first fetch registers, so it needs a replacement guard; `npm run perf`
   shares it.
2. Run links 3 at a time (eight links: 39 s → ~17 s). Cap it: 8 at once is as slow as sequential.
3. Document calling `tsx tools/shot/shot.ts` directly (−0.45 s, no code).
4. A "shoot on arrival" flag (−1.7 s on body views; the background galaxy field may be incomplete).

Not worth doing: `--build` for speed, a persistent browser profile, WebP.

## Under 100 ms

Capture alone fits (35 ms at DPR 1, 80 ms at DPR 2). The rest needs a long-lived browser with the app
booted and a client that skips `npm`/`tsx`; an in-app "go to this link" that works on a live page (a
hash change applies a body focus but not an exhibit, and leaves overlays behind); and a mode where the
camera cuts and fades snap. A code change that reloads the page still pays the ~2.5 s boot.

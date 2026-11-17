# Mock — a design mockup in the real UI, re-shot on every save

`npm run mock` opens `?mock=<name>#<hash>` on your dev server in headless Chromium, waits for the
scene to settle, and shoots it. Then it watches `src/dev/mocks/<name>.*`: each save is swapped in
by Vite's Fast Refresh and shot again, about 0.3 s after the save instead of a fresh 30 s boot.
How a mock is written lives in [`src/dev/mocks/README.md`](../../src/dev/mocks/README.md).

## Usage

```bash
npm run dev                                                    # leave running; note its Local: port
cp src/dev/mocks/example.tsx src/dev/mocks/chip.tsx            # mocks are gitignored scratch
npm run mock -- chip 'focus=body-saturn' --url http://localhost:5174
npm run mock -- chip 'focus=body-saturn' --url http://localhost:5174 --phone
```

It prints one absolute path per shot on stdout, everything else on stderr, and runs until killed.
Tail its output and Read the image after each new line.

## Flags

| flag           | default     | meaning                                                           |
| -------------- | ----------- | ----------------------------------------------------------------- |
| `--url <base>` | required    | Your running dev server. No query or hash.                        |
| `--size WxH`   | `1728x1000` | Viewport in CSS pixels; the image is twice that (dpr 2).          |
| `--phone`      | off         | 400x850 with touch and mobile emulation. Conflicts with `--size`. |

The hash is optional; a leading `#` is dropped.

## Output

One file per mock, overwritten on every shot: `data/shots/mock-<name>.jpg`, or
`data/shots/mock-<name>-phone.jpg` under `--phone` (gitignored), so a desktop and a phone run of
the same mock can go side by side.

## A new view without a reload

Type a hash (or pipe one) as a line on stdin: the tool sets `location.hash`, and the app answers
`hashchange` by flying to the new view (`watchHashReadSaga`), then the tool waits for the scene to
settle and shoots. No page reload.

## When a save does not re-shoot quickly

After a save the tool waits up to 3 s for the mount's `window.__mockRevision` to move (bumped on
each `vite:afterUpdate`), then two frames, then shoots. With no update in that time, for example
a save that changed nothing, or a syntax error showing Vite's overlay, it shoots anyway and says
so on stderr. An edit Fast Refresh cannot take (a mock exporting more than its component) reloads
the page: the tool notices, waits for the scene to settle again and shoots.

# Famous Galaxy Curator

Local-only Vite dev tool for hand-curating thumbnails for the ~75-entry
Famous catalog. Run with `npm run curate-famous` from the repo root;
opens on http://localhost:5200.

Spec: `docs/superpowers/specs/2026-05-18-famous-galaxy-curator-design.md`.

## Installing StarNet2 (macOS)

1. Download `StarNet2T_MacOS.zip` from the StarNet++ project page.
2. Unpack somewhere outside the repo (e.g. `~/Downloads/StarNet2T_MacOS/`).
3. Copy the `starnet2` binary to `/usr/local/bin/starnet2` and the
   bundled `.dylib` files to `/usr/local/lib/`.
4. Note the path to `StarNet2_weights.pt` — the curator finds it via
   the `STARNET_WEIGHTS` environment variable.
5. Verify: `STARNET_WEIGHTS=~/Downloads/StarNet2T_MacOS/StarNet2_weights.pt starnet2 -i test.png -o out.png -s 256 -e`

The curator's `/api/process` route shells out to `starnet2` and reads
`STARNET_BIN` (default `starnet2`) and `STARNET_WEIGHTS` (no default;
required) from the environment. Set them in the shell that runs
`npm run curate-famous`.

## Mock mode (no StarNet binary)

Set `MOCK_STARNET=1` to make `/api/process` skip the spawn and copy the
input directly to the starless slot. Used by the API integration tests.

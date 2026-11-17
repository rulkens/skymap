# lookbench — iterate on the antique look

Shoots each named view twice against a running dev server: the plain render (labels and UI
hidden, so close to what the look reads) and the `?antique` plate. Then it lays them side by
side, compares two iterations, or crops one region of every image for a close look.

```bash
python3 -I tools/antique/look/lookbench.py shoot before --url http://localhost:5180
# …edit a shader; Vite reloads…
python3 -I tools/antique/look/lookbench.py shoot after --only antique --url http://localhost:5180
python3 -I tools/antique/look/lookbench.py compare before after
python3 -I tools/antique/look/lookbench.py sheet before                       # plain | antique
python3 -I tools/antique/look/lookbench.py crop before milkyway 540,220,1240,560 --other after
```

- **Views** live in `views.json`, each with a pinned `t=`, so a run is repeatable. Pass
  `--views earth;north` to pick some, or `--views name=hash` for a one-off view; views are
  separated by `;` because a pose link has commas of its own (quote the argument in a shell).
- **Output** goes to `data/shots/lookbench/<set>/` (gitignored): `<view>-plain.png`,
  `<view>-antique.png`, and the sheets beside them. `sheet` and `compare` read the views a set
  holds, one-offs included; `--views` narrows them by name.
- **Failures**: a shot that did not settle prints `FAILED` with the shot tool's reason and leaves
  no image, so no half-flown or half-loaded frame lands in a sheet.
- **Python** needs Pillow only. In a worktree, always pass your own server's `--url`, or you
  shoot another branch.

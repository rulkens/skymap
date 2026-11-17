# Mesh sources — checksums and restore

`meshes.sha256` pins the hand-downloaded mesh sources: the pristine
NASA/Sketchfab downloads plus each body's edited `<key>.blend`. The pre-baked
`.prebaked.glb` outputs are not in it — they are rebuildable products, not
fetches.

The same list is backed up to R2 by `npm run sync-r2-secure` (run from
`main`), under the `Mesh sources` group named in [docs/DEPLOY.md](../../../docs/DEPLOY.md).
A fresh checkout restores every file it lists without redoing the hand
download or the Blender edits:

```sh
while IFS= read -r line; do f="${line#*  }"
  curl --fail --create-dirs -o "$f" "https://skymap-data.rulkens.com/data/raw/meshes/${f// /%20}"
done < meshes.sha256 && shasum -a 256 -c meshes.sha256
```

Run it from `data/raw/meshes/`, in bash or zsh.

## DSK to OBJ

NAIF ships the small bodies' shapes (Vesta, Ceres, Bennu) as type-2 plate DSKs.
Each is converted to an OBJ once, with `spiceypy` and `numpy` in a scratch venv
(SPICE's `dskexp -dsk <in>.bds -text <out>.obj -format 3` does the same). No
converter is kept in the repo; save this as `dsk2obj.py` and run
`python -I dsk2obj.py <in>.bds <out>.obj`:

```python
import sys, numpy as np, spiceypy as sp
sp.found_check_off()  # dlafns returns found=False at the end instead of raising
h = sp.dasopr(sys.argv[1]); dla, found = sp.dlabfs(h); v, p = [], []
while found:
    nv, nplates = sp.dskz02(h, dla)
    p.append(np.array(sp.dskp02(h, dla, 1, nplates)) + sum(map(len, v)))  # 1-based already
    v.append(np.array(sp.dskv02(h, dla, 1, nv))); dla, found = sp.dlafns(h, dla)
with open(sys.argv[2], "w") as f:
    np.savetxt(f, np.concatenate(v), fmt="v %.6f %.6f %.6f"); np.savetxt(f, np.concatenate(p), fmt="f %d %d %d")
```

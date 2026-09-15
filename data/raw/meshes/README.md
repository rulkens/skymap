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

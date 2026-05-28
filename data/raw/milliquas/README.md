# Milliquas raw data — quasar / AGN catalogue

This directory holds the **Milliquas v8** catalogue (Flesch 2023), the
upstream input to Skymap's quasar layer.  Nothing in this directory is
committed to git apart from this README; the catalogue is pulled fresh
on demand from <https://quasars.org/> via the fetcher script.

## What's here

| File | Size | Source |
|------|------|--------|
| `milliquas.zip` | ~32 MB | <https://quasars.org/milliquas.zip> |
| `milliquas.txt` | ~194 MB, ~1,021,800 lines | extracted from the zip above |
| `Milliquas-ReadMe.txt` | ~13 KB | <https://quasars.org/Milliquas-ReadMe.txt> — column-by-column format spec |
| `milliquas-references.txt` | ~200 KB | <https://quasars.org/milliquas-references.txt> — bibliographic key for the `Ref` column |
| `milliquas-sample.txt` | ~190 KB | first ~1k lines of the full catalogue (handy for parser dev) |

## How to populate it

```
npm run fetch-milliquas
```

The fetcher is idempotent: re-running it once `milliquas.txt` is in
place is a no-op (it checks the file size first and exits).  On a
fresh clone the script will:

1. Download `milliquas.zip` from <https://quasars.org/milliquas.zip>.
2. Verify its SHA-256 against the constant pinned in
   `tools/fetch/fetchMilliquas.ts`.
3. Extract `milliquas.txt` via the system `unzip`.
4. Verify the extracted file's SHA-256.

If either hash mismatches, the script exits non-zero and leaves the
downloaded files on disk so you can inspect what the upstream
publisher changed.  See the docstring in
`tools/fetch/fetchMilliquas.ts` for the procedure on a real release
bump — do **not** auto-update the pinned hashes.

The sidecar files (`Milliquas-ReadMe.txt`,
`milliquas-references.txt`, `milliquas-sample.txt`) are not fetched
by the script.  They are small enough that a maintainer can pull
them by hand once per release; the parser only needs
`milliquas.txt`.

## Expected sanity-check sizes

- `milliquas.zip` ≈ 32 MB
- `milliquas.txt` ≈ 194 MB, **1,021,800** lines

If the on-disk file is dramatically off from these, the upstream
release likely changed; consult <https://quasars.org/milliquas.htm>
before regenerating any `.bin` artefacts that depend on it.

## License

Milliquas is **free for research and visualisation use**.  Cite Flesch
(2023) in any derived work:

> Flesch, E. W. 2023, "The Million Quasars (Milliquas) Catalog,
> Version 8" — <https://arxiv.org/abs/2308.01505>

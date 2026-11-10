# Clip studio design mocks (temporary snapshot)

`mock-snapshot.tar.gz` backs up the gitignored design mocks (`src/dev/mocks/studio*`) from the
clip-studio design review loop, so a reclaimed cloud container doesn't lose them. Restore it with
`tar xzf docs/design/clip-studio/mock-snapshot.tar.gz` from the repo root. Shots land in the
gitignored `data/shots/studio-rounds/`.

Decisions live in `docs/grill-sessions/clip-studio-2026-11-07.md`. **Delete this folder before
the branch merges**: the spec and plan replace it.

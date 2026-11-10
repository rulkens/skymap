# Streams — Wikipedia summaries

`wikipedia_streams_cache.json` holds the English Wikipedia REST summaries (by article title) of the
stellar-stream articles listed in `tools/streams/data/streamWikipedia.constants.ts`. It is committed
so `npm run build-stellar-streams` rebuilds offline and byte-identically; a new row is fetched once
by that build. The text is CC BY-SA 4.0, credited in `ATTRIBUTIONS.md` (entry: wikipedia).

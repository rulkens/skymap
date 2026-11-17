/**
 * English Wikipedia articles about a stream itself, keyed by galstreams `Name` (Sagittarius by its
 * id, as the N-body model has no galstreams track). Each title was fetched from the REST summary
 * endpoint on 2026-11-07 and is `type: "standard"` with a lead about the stream. Not listed:
 * progenitor-cluster articles (Palomar 5, NGC 5466, whose "stream" titles redirect to the
 * cluster), and streams with no article. The build fails on a name that names no built stream.
 */
export const STREAM_WIKIPEDIA: Readonly<Record<string, string>> = {
  sagittarius: 'Sagittarius Stream',
  'GD-1': 'GD-1',
  Monoceros: 'Monoceros Ring',
  Aquarius: 'Aquarius Stream',
  Fimbulthul: 'Fimbulthul stream',
  'OmegaCen-Fimbulthul': 'Fimbulthul stream',
};

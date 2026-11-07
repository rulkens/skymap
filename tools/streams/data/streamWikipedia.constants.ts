/**
 * English Wikipedia articles about a stream itself, keyed by galstreams `Name` (Sagittarius by its
 * id, as the N-body model has no galstreams track). Each title was fetched from the REST summary
 * endpoint on 2026-11-07 and is `type: "standard"` with a lead about the stream. Not listed:
 * progenitor-cluster articles (Palomar 5, NGC 5466, whose "stream" titles redirect to the
 * cluster), and streams with no article. The build fails on a name that names no built stream.
 */
import type { StreamWikipediaRow } from '../@types/StreamWikipediaRow';

export const STREAM_WIKIPEDIA: readonly StreamWikipediaRow[] = [
  { name: 'sagittarius', title: 'Sagittarius Stream' },
  { name: 'GD-1', title: 'GD-1' },
  { name: 'Monoceros', title: 'Monoceros Ring' },
  { name: 'Aquarius', title: 'Aquarius Stream' },
  { name: 'Fimbulthul', title: 'Fimbulthul stream' },
  { name: 'OmegaCen-Fimbulthul', title: 'Fimbulthul stream' },
];

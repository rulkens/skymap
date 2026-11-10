import type { ParsedRecord } from '../common';

/**
 * A REGALADE row in `ParsedRecord` shape minus `source`: the source id is
 * persisted in every `.bin`, so it is assigned when the
 * catalog is wired into the build (replace-GLADE vs. add-a-source is still
 * open — see `docs/backlog/`), not by the parser.
 */
export type RegaladeRecord = Omit<ParsedRecord, 'source'>;

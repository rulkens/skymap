import type { RemoteCommand } from './RemoteCommand';
import type { RemoteGlyph } from './RemoteGlyph';
import type { RemoteMenu } from './RemoteMenu';
import type { RemoteTakeover } from './RemoteTakeover';

/** What the remote knows of one kind of show: where its menu list is, what to call it and how to start one. */
export type RemoteShowKind<K extends RemoteTakeover['kind']> = {
  readonly list: keyof RemoteMenu;
  readonly noun: string;
  readonly glyph: RemoteGlyph;
  readonly start: (id: Extract<RemoteTakeover, { kind: K }>['id']) => RemoteCommand;
};

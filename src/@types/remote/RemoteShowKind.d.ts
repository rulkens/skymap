import type { ComponentType } from 'react';
import type { IconProps } from '../../components/Icon/Icon';
import type { RemoteCommand } from './RemoteCommand';
import type { RemoteMenu } from './RemoteMenu';
import type { RemoteTakeover } from './RemoteTakeover';

/** What the remote knows of one kind of show: where its menu list is, what to call it and how to start one. */
export type RemoteShowKind<K extends RemoteTakeover['kind']> = {
  readonly list: keyof RemoteMenu;
  readonly noun: string;
  readonly icon: ComponentType<Pick<IconProps, 'size'>>;
  readonly start: (id: Extract<RemoteTakeover, { kind: K }>['id']) => RemoteCommand;
};

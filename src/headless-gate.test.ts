import { describe, it, expect, vi } from 'vitest';
import { PersistenceError } from './persistence/types.js';

vi.mock('./persistence/DocumentPersistence.js', () => ({
  DocumentPersistence: vi.fn(),
  createDocumentPersistence: vi.fn(),
}));

vi.mock('./crdt/document.js', async () => {
  const Y = await import('yjs');
  return {
    createCollabDoc: vi.fn().mockImplementation(() => new Y.Doc()),
    getSharedType: vi.fn(),
    serializeDoc: vi.fn().mockReturnValue(new Uint8Array()),
  };
});

vi.mock('./crdt/provider.js', () => ({
  createNostrSyncProvider: vi.fn(),
  NostrSyncProvider: vi.fn(),
}));

import { createDocumentPersistence } from './persistence/DocumentPersistence.js';

describe('HeadlessCollabClient load error propagation', () => {
  it('join() propagates load errors instead of mapping to { found: false }', async () => {
    const loadError = new PersistenceError('Relay query timed out for document "test-doc"');

    (createDocumentPersistence as any).mockReturnValue({
      load: vi.fn().mockRejectedValue(loadError),
      destroy: vi.fn(),
    });

    const { HeadlessCollabClient } = await import('./headless.js');
    const client = new HeadlessCollabClient({
      signer: {
        getPublicKey: async () => 'pk',
        signEvent: async (e: any) => ({ ...e, id: 'id', sig: 'sig' }),
      },
      relayUrl: 'wss://relay.test',
      blossomUrl: 'https://blossom.test',
    });

    await expect(client.join('test-doc', 'doc')).rejects.toThrow(/timed out/i);
  });
});

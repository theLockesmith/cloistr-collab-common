import { describe, it, expect } from 'vitest';

describe('HeadlessCollabClient', () => {
  it('is exported from core', async () => {
    const core = await import('./core.js');
    expect(core.HeadlessCollabClient).toBeTypeOf('function');
  });

  it('can be instantiated with a mock signer', async () => {
    const { HeadlessCollabClient } = await import('./headless.js');

    const mockSigner = {
      getPublicKey: async () => 'deadbeef'.repeat(8),
      signEvent: async (e: any) => ({ ...e, id: 'abc', sig: 'def' }),
      encrypt: async (_pk: string, plaintext: string) => plaintext,
      decrypt: async (_pk: string, ciphertext: string) => ciphertext,
    };

    const client = new HeadlessCollabClient({
      signer: mockSigner,
      relayUrl: 'wss://relay.cloistr.xyz',
      blossomUrl: 'https://nostr.download',
    });

    expect(client.connected).toBe(false);
    expect(client.peerCount).toBe(0);
  });

  it('throws when accessing doc before join', async () => {
    const { HeadlessCollabClient } = await import('./headless.js');

    const mockSigner = {
      getPublicKey: async () => 'deadbeef'.repeat(8),
      signEvent: async (e: any) => ({ ...e, id: 'abc', sig: 'def' }),
      encrypt: async (_pk: string, plaintext: string) => plaintext,
      decrypt: async (_pk: string, ciphertext: string) => ciphertext,
    };

    const client = new HeadlessCollabClient({
      signer: mockSigner,
      relayUrl: 'wss://relay.cloistr.xyz',
      blossomUrl: 'https://nostr.download',
    });

    expect(() => client.getDoc()).toThrow('Not joined');
    expect(() => client.getText()).toThrow('Not joined');
    expect(() => client.serialize()).toThrow('Not joined');
  });
});

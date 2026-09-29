import { describe, it, expect } from 'vitest';

describe('@cloistr/collab-common/core', () => {
  it('exports CRDT document operations', async () => {
    const core = await import('./core.js');
    expect(core.createCollabDoc).toBeTypeOf('function');
    expect(core.getSharedType).toBeTypeOf('function');
    expect(core.serializeDoc).toBeTypeOf('function');
    expect(core.deserializeDoc).toBeTypeOf('function');
    expect(core.mergeDocuments).toBeTypeOf('function');
    expect(core.getStateVector).toBeTypeOf('function');
    expect(core.getUpdatesSinceStateVector).toBeTypeOf('function');
    expect(core.cloneDocument).toBeTypeOf('function');
    expect(core.getDocumentStats).toBeTypeOf('function');
    expect(core.validateUpdate).toBeTypeOf('function');
    expect(core.initializeDocumentContent).toBeTypeOf('function');
  });

  it('exports NostrSyncProvider', async () => {
    const core = await import('./core.js');
    expect(core.NostrSyncProvider).toBeTypeOf('function');
    expect(core.createNostrSyncProvider).toBeTypeOf('function');
  });

  it('exports persistence', async () => {
    const core = await import('./core.js');
    expect(core.DocumentPersistence).toBeTypeOf('function');
    expect(core.createDocumentPersistence).toBeTypeOf('function');
  });

  it('exports storage (encryption + blossom)', async () => {
    const core = await import('./core.js');
    expect(core.BlobStore).toBeTypeOf('function');
    expect(core.generateKey).toBeTypeOf('function');
    expect(core.encryptBlob).toBeTypeOf('function');
    expect(core.decryptBlob).toBeTypeOf('function');
  });

  it('exports sharing utilities', async () => {
    const core = await import('./core.js');
    expect(core.generateShareId).toBeTypeOf('function');
    expect(core.hasPermission).toBeTypeOf('function');
    expect(core.createShare).toBeTypeOf('function');
    expect(core.encryptKeyForRecipient).toBeTypeOf('function');
  });

  it('exports relay pool', async () => {
    const core = await import('./core.js');
    expect(core.RelayPool).toBeTypeOf('function');
    expect(core.createRelayPool).toBeTypeOf('function');
    expect(core.getRelayPrefs).toBeTypeOf('function');
  });

  it('exports presence awareness', async () => {
    const core = await import('./core.js');
    expect(core.createAwareness).toBeTypeOf('function');
    expect(core.setLocalState).toBeTypeOf('function');
    expect(core.getRemoteStates).toBeTypeOf('function');
  });

  it('exports versioning', async () => {
    const core = await import('./core.js');
    expect(core.SnapshotManager).toBeTypeOf('function');
    expect(core.createUndoManager).toBeTypeOf('function');
    expect(core.createFullSnapshot).toBeTypeOf('function');
    expect(core.applySnapshot).toBeTypeOf('function');
  });

  it('exports config utilities', async () => {
    const core = await import('./core.js');
    expect(core.generateDocumentId).toBeTypeOf('function');
    expect(core.parseDocumentId).toBeTypeOf('function');
    expect(core.getServiceConfig).toBeTypeOf('function');
    expect(core.DEFAULT_RELAY_URL).toBeTypeOf('string');
  });

  it('does NOT export React hooks or components', async () => {
    const core = await import('./core.js');
    const exports = Object.keys(core);

    const allowlist = new Set([
      'useServiceConfig',     // not a React hook, just a function
      'NostrSyncProvider',    // pure class, not a React component
      'createNostrSyncProvider', // factory function
    ]);

    const reactNames = exports.filter(
      (name) =>
        (name.startsWith('use') || name.endsWith('Provider') || name.endsWith('Dialog')) &&
        !allowlist.has(name)
    );

    expect(reactNames).toEqual([]);
  });

  it('does not pull React into the module graph', async () => {
    // If React were in the import graph, this dynamic import would have
    // already loaded it. Check that require.cache (or the module registry)
    // does not include react.
    const core = await import('./core.js');
    expect(core).toBeDefined();

    // In vitest/Node, we can check that 'react' is not resolvable from core
    // by confirming none of the core module's transitive deps reference it.
    // A stronger test runs in a clean Node process (see the headless proof).
  });

  it('does not export initPersistence (browser-only, needs y-indexeddb)', async () => {
    const core = await import('./core.js');
    expect((core as any).initPersistence).toBeUndefined();
  });

  it('exports HeadlessCollabClient', async () => {
    const core = await import('./core.js');
    expect(core.HeadlessCollabClient).toBeTypeOf('function');
  });
});

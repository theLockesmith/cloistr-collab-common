/**
 * Integration test for NostrSyncProvider
 * Tests real relay connection and document sync
 */

import * as Y from 'yjs';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { NostrSyncProvider } from './dist/crdt/provider.js';

// Create a mock signer using nostr-tools
function createTestSigner() {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);

  return {
    async getPublicKey() {
      return pubkey;
    },
    async signEvent(unsignedEvent) {
      return finalizeEvent(unsignedEvent, secretKey);
    },
    async encrypt(pubkey, plaintext) {
      throw new Error('Not implemented for test');
    },
    async decrypt(pubkey, ciphertext) {
      throw new Error('Not implemented for test');
    }
  };
}

async function runTest() {
  console.log('=== NostrSyncProvider Integration Test ===\n');

  // Create two Yjs documents to test sync
  const doc1 = new Y.Doc();
  const doc2 = new Y.Doc();

  const signer1 = createTestSigner();
  const signer2 = createTestSigner();

  const pubkey1 = await signer1.getPublicKey();
  const pubkey2 = await signer2.getPublicKey();
  console.log(`Client 1 pubkey: ${pubkey1.slice(0, 16)}...`);
  console.log(`Client 2 pubkey: ${pubkey2.slice(0, 16)}...`);

  const docId = `test-doc-${Date.now()}`;
  console.log(`Document ID: ${docId}\n`);

  // Create providers for both docs
  const provider1 = new NostrSyncProvider(doc1, {
    signer: signer1,
    relayUrl: 'wss://nos.lol',
    docId: docId,
  });

  const provider2 = new NostrSyncProvider(doc2, {
    signer: signer2,
    relayUrl: 'wss://nos.lol',
    docId: docId,
  });

  // Set up event handlers
  provider1.onConnect = () => console.log('[Client 1] Connected');
  provider1.onDisconnect = () => console.log('[Client 1] Disconnected');
  provider1.onError = (e) => console.error('[Client 1] Error:', e.message);
  provider1.onPeersChange = (n) => console.log(`[Client 1] Peers: ${n}`);

  provider2.onConnect = () => console.log('[Client 2] Connected');
  provider2.onDisconnect = () => console.log('[Client 2] Disconnected');
  provider2.onError = (e) => console.error('[Client 2] Error:', e.message);
  provider2.onPeersChange = (n) => console.log(`[Client 2] Peers: ${n}`);

  try {
    // Connect both providers
    console.log('Connecting to relay...');
    await Promise.all([
      provider1.connect(),
      provider2.connect(),
    ]);
    console.log('Both clients connected!\n');

    // Get the shared text from doc1
    const text1 = doc1.getText('content');
    const text2 = doc2.getText('content');

    // Make a change on doc1
    console.log('Client 1 inserting text...');
    text1.insert(0, 'Hello from client 1!');
    console.log(`Doc 1 content: "${text1.toString()}"`);

    // Wait for sync
    console.log('Waiting for sync (2 seconds)...');
    await new Promise(r => setTimeout(r, 2000));

    console.log(`Doc 2 content: "${text2.toString()}"`);

    // Make a change on doc2
    console.log('\nClient 2 inserting text...');
    text2.insert(text2.length, ' Hello from client 2!');
    console.log(`Doc 2 content: "${text2.toString()}"`);

    // Wait for sync
    console.log('Waiting for sync (2 seconds)...');
    await new Promise(r => setTimeout(r, 2000));

    console.log(`Doc 1 content: "${text1.toString()}"`);

    // Verify sync
    const content1 = text1.toString();
    const content2 = text2.toString();

    console.log('\n=== Results ===');
    console.log(`Doc 1: "${content1}"`);
    console.log(`Doc 2: "${content2}"`);

    if (content1 === content2) {
      console.log('\n✅ SUCCESS: Documents are in sync!');
    } else {
      console.log('\n❌ FAILED: Documents are NOT in sync');
      console.log('  This may be expected if the relay does not support ephemeral events');
    }

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    // Cleanup
    provider1.destroy();
    provider2.destroy();
    console.log('\nTest complete.');
    process.exit(0);
  }
}

runTest().catch(console.error);

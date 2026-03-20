/**
 * @fileoverview Example usage of Cloistr auth module
 * This file demonstrates how to use the unified Nostr authentication system
 */

import { useState } from 'react';
import { Event, UnsignedEvent } from 'nostr-tools';
import {
  AuthProvider,
  useNostrAuth,
  useAuthHelpers,
  connectNip07,
  connectNip46,
  detectExtension,
  isValidBunkerUrl,
  AuthError,
} from './index.js';

/**
 * Example: Basic auth provider setup
 */
export function AppWithAuth() {
  return (
    <AuthProvider autoRestore={true}>
      <AuthDemoComponent />
    </AuthProvider>
  );
}

/**
 * Example: Using the auth context
 */
function AuthDemoComponent() {
  const {
    authState,
    connectNip07,
    connectNip46,
    disconnect,
    signer,
  } = useNostrAuth();

  const {
    isAuthAvailable,
    isNip07Available,
    isNip46Available,
    isAuthenticated,
    userPubkey,
    authMethod,
  } = useAuthHelpers();

  const [bunkerUrl, setBunkerUrl] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * Connect using NIP-07 browser extension
   */
  const handleNip07Connect = async () => {
    setLoading(true);
    try {
      await connectNip07();
      console.log('Successfully connected via NIP-07');
    } catch (error) {
      console.error('NIP-07 connection failed:', error);
      if (error instanceof AuthError) {
        alert(`Authentication failed: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Connect using NIP-46 remote signer
   */
  const handleNip46Connect = async () => {
    if (!bunkerUrl || !isValidBunkerUrl(bunkerUrl)) {
      alert('Please enter a valid bunker URL');
      return;
    }

    setLoading(true);
    try {
      await connectNip46({
        bunkerUrl,
        timeout: 30000,
      });
      console.log('Successfully connected via NIP-46');
    } catch (error) {
      console.error('NIP-46 connection failed:', error);
      if (error instanceof AuthError) {
        alert(`Authentication failed: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Example: Sign an event
   */
  const handleSignEvent = async () => {
    if (!signer) {
      alert('No signer available');
      return;
    }

    try {
      const pubkey = await signer.getPublicKey();
      const unsignedEvent: UnsignedEvent = {
        kind: 1, // Text note
        pubkey,
        tags: [],
        content: 'Hello from Cloistr!',
        created_at: Math.floor(Date.now() / 1000),
      };

      const signedEvent = await signer.signEvent(unsignedEvent);
      console.log('Signed event:', signedEvent);
      alert('Event signed successfully!');
    } catch (error) {
      console.error('Failed to sign event:', error);
      alert('Failed to sign event');
    }
  };

  /**
   * Example: Encrypt/decrypt message
   */
  const handleEncryptMessage = async () => {
    if (!signer) {
      alert('No signer available');
      return;
    }

    try {
      const recipientPubkey = prompt('Enter recipient pubkey (hex):');
      const message = prompt('Enter message to encrypt:');

      if (!recipientPubkey || !message) {
        return;
      }

      const encrypted = await signer.encrypt(recipientPubkey, message);
      console.log('Encrypted message:', encrypted);

      // Decrypt it back (for demo purposes)
      const decrypted = await signer.decrypt(recipientPubkey, encrypted);
      alert(`Encrypted: ${encrypted}\nDecrypted: ${decrypted}`);
    } catch (error) {
      console.error('Failed to encrypt/decrypt:', error);
      alert('Failed to encrypt/decrypt message');
    }
  };

  // Show auth status and controls
  return (
    <div style={{ padding: '20px', maxWidth: '600px' }}>
      <h2>Cloistr Auth Demo</h2>

      {/* Auth Status */}
      <div style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ccc' }}>
        <h3>Auth Status</h3>
        <p><strong>Available:</strong> {isAuthAvailable ? 'Yes' : 'No'}</p>
        <p><strong>NIP-07 Available:</strong> {isNip07Available ? 'Yes' : 'No'}</p>
        <p><strong>NIP-46 Available:</strong> {isNip46Available ? 'Yes' : 'No'}</p>
        <p><strong>Authenticated:</strong> {isAuthenticated ? 'Yes' : 'No'}</p>
        <p><strong>Method:</strong> {authMethod || 'None'}</p>
        <p><strong>Pubkey:</strong> {userPubkey ? `${userPubkey.substring(0, 16)}...` : 'None'}</p>
        <p><strong>Connecting:</strong> {authState.isConnecting ? 'Yes' : 'No'}</p>
        {authState.error && (
          <p style={{ color: 'red' }}><strong>Error:</strong> {authState.error}</p>
        )}
      </div>

      {!isAuthenticated ? (
        <div>
          <h3>Connect</h3>

          {/* NIP-07 Connection */}
          {isNip07Available && (
            <div style={{ marginBottom: '15px' }}>
              <h4>NIP-07 (Browser Extension)</h4>
              <p>Extension detected: {detectExtension().name || 'Unknown'}</p>
              <button
                onClick={handleNip07Connect}
                disabled={loading}
                style={{ padding: '10px 20px' }}
              >
                {loading ? 'Connecting...' : 'Connect with Extension'}
              </button>
            </div>
          )}

          {/* NIP-46 Connection */}
          {isNip46Available && (
            <div>
              <h4>NIP-46 (Remote Signer)</h4>
              <input
                type="text"
                placeholder="bunker://pubkey?relay=wss://relay.example.com"
                value={bunkerUrl}
                onChange={(e) => setBunkerUrl(e.target.value)}
                style={{ width: '100%', padding: '8px', marginBottom: '10px' }}
              />
              <button
                onClick={handleNip46Connect}
                disabled={loading || !bunkerUrl}
                style={{ padding: '10px 20px' }}
              >
                {loading ? 'Connecting...' : 'Connect with Remote Signer'}
              </button>
            </div>
          )}

          {!isAuthAvailable && (
            <p>No authentication methods available in this environment.</p>
          )}
        </div>
      ) : (
        <div>
          <h3>Actions</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={handleSignEvent} style={{ padding: '10px 20px' }}>
              Sign Event
            </button>
            <button onClick={handleEncryptMessage} style={{ padding: '10px 20px' }}>
              Encrypt/Decrypt
            </button>
            <button onClick={disconnect} style={{ padding: '10px 20px', backgroundColor: '#ff6b6b' }}>
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Example: Direct signer usage (without React context)
 */
export async function directSignerExample() {
  try {
    // Connect to NIP-07 extension
    const signer = await connectNip07();

    // Get public key
    const pubkey = await signer.getPublicKey();
    console.log('Connected with pubkey:', pubkey);

    // Sign an event
    const event: UnsignedEvent = {
      kind: 1,
      pubkey,
      tags: [],
      content: 'Hello Nostr!',
      created_at: Math.floor(Date.now() / 1000),
    };

    const signedEvent = await signer.signEvent(event);
    console.log('Signed event:', signedEvent);

  } catch (error) {
    console.error('Direct signer example failed:', error);
  }
}

/**
 * Example: NIP-46 usage
 */
export async function nip46Example() {
  try {
    // Connect to remote signer
    const signer = await connectNip46({
      bunkerUrl: 'bunker://your-pubkey-here?relay=wss://relay.example.com',
      timeout: 30000,
    });

    // Use the signer
    const pubkey = await signer.getPublicKey();
    console.log('Connected to remote signer:', pubkey);

    // Clean up
    await signer.disconnect?.();

  } catch (error) {
    console.error('NIP-46 example failed:', error);
  }
}
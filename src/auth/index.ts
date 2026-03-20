/**
 * @fileoverview Cloistr auth module - unified NIP-46 and NIP-07 authentication
 *
 * This module provides a unified interface for Nostr authentication in Cloistr
 * collaboration applications, supporting both browser extension (NIP-07) and
 * remote signer (NIP-46) authentication methods.
 *
 * @example Basic usage
 * ```tsx
 * import { AuthProvider, useNostrAuth } from '@cloistr/collab-common/auth';
 *
 * function App() {
 *   return (
 *     <AuthProvider>
 *       <MyComponent />
 *     </AuthProvider>
 *   );
 * }
 *
 * function MyComponent() {
 *   const { authState, connectNip07, connectNip46, disconnect, signer } = useNostrAuth();
 *
 *   const handleNip07Connect = async () => {
 *     try {
 *       await connectNip07();
 *       console.log('Connected via NIP-07');
 *     } catch (error) {
 *       console.error('Failed to connect:', error);
 *     }
 *   };
 *
 *   const handleNip46Connect = async () => {
 *     try {
 *       await connectNip46({
 *         bunkerUrl: 'bunker://pubkey?relay=wss://relay.example.com'
 *       });
 *       console.log('Connected via NIP-46');
 *     } catch (error) {
 *       console.error('Failed to connect:', error);
 *     }
 *   };
 *
 *   if (authState.isConnected && signer) {
 *     return (
 *       <div>
 *         <p>Connected as: {authState.pubkey}</p>
 *         <p>Method: {authState.method}</p>
 *         <button onClick={disconnect}>Disconnect</button>
 *       </div>
 *     );
 *   }
 *
 *   return (
 *     <div>
 *       <button onClick={handleNip07Connect}>Connect with Extension</button>
 *       <button onClick={handleNip46Connect}>Connect with Remote Signer</button>
 *     </div>
 *   );
 * }
 * ```
 *
 * @example Direct signer usage
 * ```ts
 * import { connectNip07, connectNip46 } from '@cloistr/collab-common/auth';
 * import { UnsignedEvent } from 'nostr-tools';
 *
 * // Connect to signer
 * const signer = await connectNip07();
 * // or: const signer = await connectNip46({ bunkerUrl: '...' });
 *
 * // Get public key
 * const pubkey = await signer.getPublicKey();
 *
 * // Sign an event
 * const unsignedEvent: UnsignedEvent = {
 *   kind: 1,
 *   tags: [],
 *   content: 'Hello Nostr!',
 *   created_at: Math.floor(Date.now() / 1000),
 * };
 * const signedEvent = await signer.signEvent(unsignedEvent);
 *
 * // Encrypt/decrypt messages
 * const encrypted = await signer.encrypt(recipientPubkey, 'Secret message');
 * const decrypted = await signer.decrypt(senderPubkey, encrypted);
 * ```
 */

// Type exports
export type {
  AuthState,
  SignerInterface,
  AuthMethod,
  AuthContextValue,
  Nip46Config,
  ExtensionDetection,
} from './types.js';

// Error exports
export {
  AuthError,
  Nip07Error,
  Nip46Error,
} from './types.js';

// NIP-07 exports
export {
  connectNip07,
  detectExtension,
  isNip07Supported,
} from './nip07.js';

// NIP-46 exports
export {
  connectNip46,
  isNip46Supported,
  isValidBunkerUrl,
} from './nip46.js';

// React context exports
export {
  AuthProvider,
  useNostrAuth,
  useAuthHelpers,
} from './context.js';

// Re-export commonly used types from context
export type { AuthProviderProps } from './context.js';
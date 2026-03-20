# Cloistr Auth Module

Unified NIP-46 (remote signer) and NIP-07 (browser extension) authentication for Cloistr collaboration apps.

## Features

- **Unified Interface**: Single API for both NIP-07 and NIP-46 authentication
- **React Integration**: Context provider and hooks for React apps
- **Type Safety**: Full TypeScript support with comprehensive error types
- **Session Persistence**: Automatic session restore across browser reloads
- **Error Handling**: Detailed error types for debugging and user feedback

## Quick Start

### Basic Setup with React

```tsx
import { AuthProvider, useNostrAuth } from '@cloistr/collab-common/auth';

function App() {
  return (
    <AuthProvider>
      <MyComponent />
    </AuthProvider>
  );
}

function MyComponent() {
  const { authState, connectNip07, connectNip46, disconnect, signer } = useNostrAuth();

  if (authState.isConnected) {
    return (
      <div>
        <p>Connected as: {authState.pubkey}</p>
        <button onClick={disconnect}>Disconnect</button>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => connectNip07()}>
        Connect with Extension
      </button>
      <button onClick={() => connectNip46({ bunkerUrl: 'bunker://...' })}>
        Connect with Remote Signer
      </button>
    </div>
  );
}
```

### Direct Signer Usage

```ts
import { connectNip07, connectNip46 } from '@cloistr/collab-common/auth';

// Connect via browser extension
const signer = await connectNip07();

// Or connect via remote signer
const signer = await connectNip46({
  bunkerUrl: 'bunker://pubkey?relay=wss://relay.example.com'
});

// Use the signer
const pubkey = await signer.getPublicKey();
const signedEvent = await signer.signEvent(unsignedEvent);
const encrypted = await signer.encrypt(recipientPubkey, message);
```

## API Reference

### Types

#### `AuthState`
Current authentication state including connection status and user info.

#### `SignerInterface`
Unified interface for cryptographic operations:
- `getPublicKey()`: Get user's public key
- `signEvent(event)`: Sign a Nostr event
- `encrypt(pubkey, message)`: Encrypt a message
- `decrypt(pubkey, ciphertext)`: Decrypt a message

#### `AuthMethod`
Authentication method: `'nip07'` or `'nip46'`

### Functions

#### `connectNip07()`
Connect to a NIP-07 browser extension.

#### `connectNip46(config)`
Connect to a NIP-46 remote signer.

**Parameters:**
- `config.bunkerUrl`: Bunker URL for remote signer
- `config.relayUrls`: Optional relay URLs (defaults provided)
- `config.timeout`: Connection timeout in ms (default: 30000)

#### `detectExtension()`
Detect available NIP-07 browser extensions.

#### `isValidBunkerUrl(url)`
Validate bunker URL format.

### React Hooks

#### `useNostrAuth()`
Access auth context with connection methods and current signer.

#### `useAuthHelpers()`
Convenience hook with computed auth state properties.

### Error Types

- **`AuthError`**: Base auth error class
- **`Nip07Error`**: NIP-07 specific errors
- **`Nip46Error`**: NIP-46 specific errors

## Configuration

### AuthProvider Props

```tsx
<AuthProvider
  autoRestore={true}        // Auto-restore previous session
  storage={customStorage}   // Custom storage implementation
>
```

### Custom Storage

Provide your own storage implementation:

```ts
const customStorage = {
  getItem: (key: string) => string | null,
  setItem: (key: string, value: string) => void,
  removeItem: (key: string) => void,
};
```

## Error Handling

```ts
try {
  await connectNip07();
} catch (error) {
  if (error instanceof Nip07Error) {
    switch (error.code) {
      case 'EXTENSION_NOT_FOUND':
        // Show extension install instructions
        break;
      case 'CONNECTION_FAILED':
        // Handle connection failure
        break;
    }
  }
}
```

## Common Error Codes

### NIP-07
- `EXTENSION_NOT_FOUND`: No compatible extension installed
- `CONNECTION_FAILED`: Failed to connect to extension
- `GET_PUBKEY_FAILED`: Failed to get public key
- `SIGN_EVENT_FAILED`: Failed to sign event
- `NIP04_NOT_SUPPORTED`: Extension doesn't support encryption

### NIP-46
- `INVALID_BUNKER_URL`: Malformed bunker URL
- `CONNECTION_FAILED`: Failed to connect to remote signer
- `TIMEOUT`: Request timed out
- `REMOTE_ERROR`: Error from remote signer
- `DISCONNECTED`: Connection was closed

## Browser Support

- **NIP-07**: Requires compatible browser extension (Alby, nos2x, etc.)
- **NIP-46**: Works in any modern browser with WebSocket support
- **React**: Compatible with React 18+

## Security Considerations

1. **Key Management**: Private keys never leave the signer (extension or remote)
2. **Transport Security**: NIP-46 uses encrypted communication over WebSockets
3. **Session Storage**: Only public keys and connection metadata are stored locally
4. **Error Information**: Avoid logging sensitive error details in production

## Development

### Running Tests

```bash
npm test src/auth/auth.test.ts
```

### Building

```bash
npm run build
```

The module compiles to both CommonJS and ES modules in the `dist/auth/` directory.

## Examples

See `example.tsx` for comprehensive usage examples including:
- React component integration
- Direct signer usage
- Error handling patterns
- Encryption/decryption workflows
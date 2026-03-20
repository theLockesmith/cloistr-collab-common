# Cloistr Storage Module

The storage module provides encrypted blob storage for Cloistr collaboration apps using the Blossom protocol with client-side encryption.

## Features

- **Client-side encryption** using XChaCha20-Poly1305
- **Blossom blob storage** with NIP-98 authentication
- **React hooks** for easy integration
- **TypeScript support** with full type safety
- **Error handling** with typed exceptions

## Quick Start

```typescript
import { useBlobStore, useEncryptedUpload, generateKey } from '@cloistr/collab-common/storage';

// Configuration
const config = {
  blossomUrl: 'https://blossom.cloistr.xyz',
  authPubkey: yourPublicKey
};

// In a React component
function FileUploader() {
  const { uploadBlob, isUploading, progress, error } = useEncryptedUpload(config, signer);

  const handleUpload = async (file: File) => {
    const data = new Uint8Array(await file.arrayBuffer());
    const { metadata, encryptionKey } = await uploadBlob(data, file.type);

    // Save metadata and encryption key securely
    console.log('Uploaded:', metadata);
    console.log('Encryption key:', encryptionKey);
  };

  return (
    <div>
      {isUploading && <div>Progress: {progress}%</div>}
      {error && <div>Error: {error}</div>}
      <input type="file" onChange={e => handleUpload(e.target.files[0])} />
    </div>
  );
}
```

## Core Components

### BlobStore

Low-level client for Blossom blob storage:

```typescript
import { BlobStore } from '@cloistr/collab-common/storage';

const store = new BlobStore(config);
await store.upload(data, mimeType, signer);
await store.download(hash);
await store.delete(hash, signer);
```

### Encryption

Client-side encryption utilities:

```typescript
import { generateKey, encryptBlob, decryptBlob } from '@cloistr/collab-common/storage';

const key = await generateKey();
const encrypted = await encryptBlob(data, key);
const decrypted = await decryptBlob(encrypted, key);
```

### React Hooks

- **useBlobStore()** - Get BlobStore instance
- **useEncryptedUpload()** - Upload with encryption
- **useEncryptedDownload()** - Download with decryption
- **useBlobManager()** - Delete, exists check, metadata
- **useEncryptionKeys()** - Generate and manage keys

## Error Handling

The module provides typed exceptions:

```typescript
import { StorageError, EncryptionError, BlossomError } from '@cloistr/collab-common/storage';

try {
  await store.upload(data, mimeType, signer);
} catch (error) {
  if (error instanceof BlossomError) {
    console.error('Blossom server error:', error.status);
  } else if (error instanceof EncryptionError) {
    console.error('Encryption failed:', error.message);
  }
}
```

## Security

- All data is encrypted client-side before upload
- Encryption keys never leave the client
- Uses XChaCha20-Poly1305 (industry standard AEAD)
- NIP-98 authentication for authorized uploads/deletes
- Hash verification ensures data integrity

## Implementation Details

- **Protocol**: Blossom (Nostr blob storage)
- **Authentication**: NIP-98 HTTP Auth events
- **Encryption**: XChaCha20-Poly1305 via libsodium
- **Hashing**: SHA-256 via Web Crypto API
- **Transport**: Standard HTTP/HTTPS
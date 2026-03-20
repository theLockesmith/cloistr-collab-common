# CRDT Module

This module provides CRDT (Conflict-free Replicated Data Type) functionality using Yjs for collaborative document editing with Nostr relay synchronization.

## Features

- **Multiple Document Types**: Support for documents, spreadsheets, slides, and whiteboards
- **Real-time Sync**: Nostr-based synchronization via WebSocket relays
- **Offline Support**: Local persistence with IndexedDB
- **React Integration**: Context providers and hooks for React applications
- **Type Safety**: Full TypeScript support with proper type definitions

## Quick Start

### Basic Usage

```typescript
import { createCollabDoc, getSharedType, NostrSyncProvider } from '@cloistr/collab-common/crdt';

// Create a new collaborative document
const doc = createCollabDoc('my-document-id', 'doc');

// Get the shared text object
const sharedText = getSharedType(doc, 'doc'); // Returns Y.Text

// Add some content
sharedText.insert(0, 'Hello, collaborative world!');

// Set up Nostr sync
const provider = new NostrSyncProvider(doc, {
  relayUrl: 'wss://relay.example.com',
  docId: 'my-document-id',
  roomPubkey: 'optional-room-pubkey'
});

await provider.connect();
```

### React Integration

```tsx
import React from 'react';
import {
  CollabDocProvider,
  useCollabDoc,
  useYjs,
  useSharedType
} from '@cloistr/collab-common/crdt';

function DocumentEditor() {
  const { isLoaded, isSynced, peerCount } = useCollabDoc();
  const sharedText = useSharedType('doc');

  if (!isLoaded || !sharedText) {
    return <div>Loading document...</div>;
  }

  return (
    <div>
      <div>Status: {isSynced ? 'Synced' : 'Offline'} | Peers: {peerCount}</div>
      <textarea
        value={sharedText.toString()}
        onChange={(e) => {
          sharedText.delete(0, sharedText.length);
          sharedText.insert(0, e.target.value);
        }}
      />
    </div>
  );
}

function App() {
  return (
    <CollabDocProvider
      config={{
        docId: 'my-document',
        docType: 'doc',
        syncConfig: {
          relayUrl: 'wss://relay.example.com',
          docId: 'my-document',
        },
        persist: true
      }}
    >
      <DocumentEditor />
    </CollabDocProvider>
  );
}
```

## Document Types

### Text Documents (`doc`)
```typescript
const doc = createCollabDoc('doc-id', 'doc');
const text = getSharedType(doc, 'doc'); // Y.Text
text.insert(0, 'Hello world');
text.format(0, 5, { bold: true });
```

### Spreadsheets (`sheet`)
```typescript
const doc = createCollabDoc('sheet-id', 'sheet');
const sheet = getSharedType(doc, 'sheet'); // Y.Map
const cells = new Y.Map();
cells.set('A1', 'Header');
cells.set('B1', 42);
sheet.set('cells', cells);
```

### Presentations (`slide`)
```typescript
const doc = createCollabDoc('slides-id', 'slide');
const slides = getSharedType(doc, 'slide'); // Y.Array
const slide1 = new Y.Map();
slide1.set('title', 'Welcome');
slide1.set('content', 'Slide content here');
slides.push([slide1]);
```

### Whiteboards (`whiteboard`)
```typescript
const doc = createCollabDoc('board-id', 'whiteboard');
const whiteboard = getSharedType(doc, 'whiteboard'); // Y.Map
const elements = new Y.Array();
elements.push([{
  type: 'rectangle',
  x: 100,
  y: 100,
  width: 200,
  height: 150,
  color: '#ff0000'
}]);
whiteboard.set('elements', elements);
```

## Nostr Integration

The NostrSyncProvider uses ephemeral events for real-time collaboration:

- **Kind 25078**: Document updates (ephemeral)
- **Kind 25079**: Presence heartbeats (ephemeral)

Events include document ID tagging for proper filtering and optional room-based collaboration.

### Event Structure

```typescript
interface NostrUpdateMessage {
  docId: string;           // Document identifier
  update: string;          // Base64-encoded Yjs update
  timestamp: number;       // Unix timestamp
  sender: string;          // Client identifier
  room?: string;           // Optional room/channel
}
```

## Advanced Features

### Manual Sync Control
```typescript
import { useSyncControls } from '@cloistr/collab-common/crdt';

function SyncStatus() {
  const { reconnect, clearError, connected, peerCount } = useSyncControls();

  return (
    <div>
      <span>Connected: {connected ? 'Yes' : 'No'}</span>
      <span>Peers: {peerCount}</span>
      <button onClick={reconnect}>Reconnect</button>
      <button onClick={clearError}>Clear Errors</button>
    </div>
  );
}
```

### Document Statistics
```typescript
import { getDocumentStats } from '@cloistr/collab-common/crdt';

const stats = getDocumentStats(doc);
console.log('Operations:', stats.operationCount);
console.log('Size:', stats.sizeBytes, 'bytes');
console.log('Contributors:', stats.clientCount);
```

### Update Validation
```typescript
import { validateUpdate } from '@cloistr/collab-common/crdt';

const isValid = validateUpdate(updateData);
if (!isValid) {
  console.warn('Received invalid update');
}
```

## Best Practices

1. **Error Handling**: Always handle sync errors gracefully
2. **Connection Management**: Use the provided hooks for connection state
3. **Performance**: Consider document size limits for large collaborations
4. **Security**: Implement proper authentication in production (demo uses dummy keys)
5. **Persistence**: Enable IndexedDB persistence for offline support

## Production Considerations

- **Key Management**: Replace dummy key generation with proper Nostr key management
- **Relay Selection**: Use reliable, well-maintained relay infrastructure
- **Rate Limiting**: Implement appropriate rate limiting for large documents
- **Data Validation**: Add additional validation for document content
- **Error Recovery**: Implement robust error recovery mechanisms
# Presence Module

The presence module provides real-time user presence awareness using the Yjs awareness protocol, with Nostr pubkey integration for identity and deterministic color generation.

## Features

- **Real-time user awareness** - See who's online and their cursor positions
- **Nostr integration** - Uses Nostr pubkeys as user identity
- **Deterministic colors** - Same user always gets the same color
- **React hooks** - Easy integration with React applications
- **UI components** - Ready-to-use presence visualization components
- **TypeScript support** - Full type safety

## Quick Start

```tsx
import React from 'react';
import * as Y from 'yjs';
import {
  createAwareness,
  usePresence,
  UserAvatars,
  RemoteCursor,
} from '@cloistr/collab-common/presence';

function MyCollaborativeApp() {
  const [doc] = useState(() => new Y.Doc());
  const [awareness] = useState(() => createAwareness(doc));

  const { state, updateCursor, isReady } = usePresence(
    awareness,
    {
      pubkey: 'your_nostr_pubkey_here',
      name: 'Your Name',
    }
  );

  const handleMouseMove = (event: MouseEvent) => {
    if (isReady) {
      updateCursor({ x: event.clientX, y: event.clientY });
    }
  };

  return (
    <div onMouseMove={handleMouseMove}>
      <UserAvatars remoteUsers={state.remoteUsers} localUser={state.localUser} />
      {state.remoteUsers.map(user =>
        user.cursor ? (
          <RemoteCursor key={user.clientId} user={user} position={user.cursor} />
        ) : null
      )}
    </div>
  );
}
```

## Core Concepts

### UserPresence

```typescript
interface UserPresence {
  clientId: number;        // Yjs awareness client ID
  pubkey: string;          // Nostr public key (hex)
  name: string;            // Display name
  color: string;           // User color (generated from pubkey)
  cursor?: CursorPosition; // Current cursor position
  selection?: SelectionRange; // Current selection
  lastSeen: number;        // Last activity timestamp
}
```

### CursorPosition

```typescript
interface CursorPosition {
  x?: number;      // Spatial X coordinate
  y?: number;      // Spatial Y coordinate
  index?: number;  // Text position (character offset)
  length?: number; // Selection length
}
```

## Hooks

### usePresence()

Primary hook for managing presence state.

```tsx
const {
  state,           // Complete presence state
  updateCursor,    // Update cursor position
  updateSelection, // Update text selection
  updateName,      // Update display name
  isReady,         // Whether presence is initialized
} = usePresence(awareness, config, callbacks);
```

### useRemoteUsers()

Get only remote users (excludes local user).

```tsx
const {
  remoteUsers, // Array of remote users
  userCount,   // Total user count
  isReady,     // Ready state
} = useRemoteUsers(awareness);
```

### useLocalUser()

Manage only local user state.

```tsx
const {
  localUser,      // Local user state
  updateCursor,   // Update cursor
  updateName,     // Update name
  setLocalState,  // Set arbitrary state
  isReady,        // Ready state
} = useLocalUser(awareness, config);
```

## Components

### UserAvatars

Shows user avatars with their assigned colors.

```tsx
<UserAvatars
  remoteUsers={remoteUsers}
  localUser={localUser}
  maxVisible={5}
  showNames={true}
  onAvatarClick={(user) => console.log(user)}
/>
```

### RemoteCursor

Displays a remote user's cursor position.

```tsx
<RemoteCursor
  user={user}
  position={cursor}
  showLabel={true}
/>
```

### PresenceIndicator

Shows online/offline status.

```tsx
<PresenceIndicator
  user={user}
  isOnline={isOnline}
  showName={true}
/>
```

### CollaboratorList

Displays all connected users.

```tsx
<CollaboratorList
  users={[localUser, ...remoteUsers]}
  localUserPubkey={localUserPubkey}
  showStatus={true}
  onUserClick={(user) => console.log(user)}
/>
```

## Awareness Utilities

### createAwareness()

Creates and configures awareness instance with cleanup.

```typescript
const awareness = createAwareness(doc);
```

### generateUserColor()

Generates deterministic color from pubkey.

```typescript
const color = generateUserColor(pubkey); // Same pubkey = same color
```

### setupAwarenessListeners()

Sets up event listeners with callbacks.

```typescript
const cleanup = setupAwarenessListeners(awareness, {
  onUserJoin: (user) => console.log('User joined:', user.name),
  onUserLeave: (user) => console.log('User left:', user.name),
  onCursorUpdate: (user, cursor) => console.log('Cursor update'),
});

// Clean up when done
cleanup();
```

## Integration with Text Editors

For text editors, use `index` and `length` in cursor position:

```tsx
const handleSelectionChange = (selection: { index: number, length: number }) => {
  updateCursor({ index: selection.index, length: selection.length });
};

// For showing remote selections
{remoteUsers.map(user =>
  user.cursor?.index !== undefined ? (
    <RemoteSelection
      key={user.clientId}
      user={user}
      startIndex={user.cursor.index}
      endIndex={user.cursor.index + (user.cursor.length || 0)}
    />
  ) : null
)}
```

## Integration with Spatial Editors

For canvas/whiteboard apps, use `x` and `y` coordinates:

```tsx
const handleMouseMove = (event: MouseEvent) => {
  updateCursor({
    x: event.clientX,
    y: event.clientY,
  });
};

// Remote cursors are positioned absolutely
{remoteUsers.map(user =>
  user.cursor?.x !== undefined ? (
    <RemoteCursor
      key={user.clientId}
      user={user}
      position={user.cursor}
      style={{ left: user.cursor.x, top: user.cursor.y }}
    />
  ) : null
)}
```

## Color System

Colors are generated deterministically from Nostr pubkeys using HSL:

- **Hue**: Derived from pubkey (0-360°)
- **Saturation**: 65-90% for good visibility
- **Lightness**: 45-65% for good contrast

This ensures:
- Same user always gets same color
- Colors are visually distinct
- Good contrast against light backgrounds
- Accessibility friendly

## Best Practices

1. **Clean up awareness** when components unmount
2. **Throttle cursor updates** to avoid excessive network traffic
3. **Handle offline users** by checking `lastSeen` timestamps
4. **Use proper TypeScript types** for type safety
5. **Customize components** for your app's design system

## Example

See `examples/presence-example.tsx` for a complete working example.
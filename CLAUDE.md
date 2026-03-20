# CLAUDE.md - cloistr-collab-common

**Shared collaboration infrastructure for all Cloistr apps (Docs, Sheets, Slides, Whiteboard).**

## Project Information

| Field | Value |
|-------|-------|
| **Company** | Coldforge LLC |
| **Type** | Shared Library |
| **Language** | TypeScript |
| **Framework** | React 18 |
| **CRDT** | Yjs |
| **Repository** | `git@git.coldforge.xyz:coldforge/cloistr-collab-common.git` |

**Parent Context:** See [Cloistr CLAUDE.md](~/claude/coldforge/cloistr/CLAUDE.md)

## Architecture Decision

**React + Yjs** selected for collaboration suite (2026-03-20):
- React: Excalidraw is React-native, TipTap/Univer have official React bindings
- Yjs: Native bindings for all target editors (TipTap, Excalidraw, Univer)

## Module Structure

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| `auth` | NIP-46/NIP-07 unified auth | `useNostrAuth`, `AuthProvider` |
| `storage` | Blossom client + encryption | `BlobStore`, `encryptBlob`, `decryptBlob` |
| `relay` | Nostr relay pool + Yjs sync | `RelayPool`, `NostrProvider` |
| `crdt` | Yjs document management | `CollabDoc`, `useCollabDoc` |
| `presence` | Cursor sync, user awareness | `usePresence`, `AwarenessProvider` |
| `sharing` | Permissions, link generation | `ShareLink`, `usePermissions` |
| `versioning` | Snapshots, undo/redo | `useVersioning`, `SnapshotManager` |
| `components` | Shared React UI | `Toolbar`, `UserAvatars`, `ShareDialog` |

## Integration Pattern

All Cloistr collaboration apps follow this pattern:

```tsx
import { AuthProvider, CollabDoc, usePresence } from '@cloistr/collab-common';

function App() {
  return (
    <AuthProvider>
      <CollabDoc docId="..." docType="doc|sheet|slide|whiteboard">
        <Editor />
      </CollabDoc>
    </AuthProvider>
  );
}
```

## Nostr Integration

- **Sync:** Yjs updates published as ephemeral Nostr events (kind 25xxx)
- **Persistence:** Yjs snapshots stored in Blossom, referenced by kind 30078 events
- **Presence:** Awareness protocol via ephemeral events
- **Sharing:** NIP-44 encrypted session keys

## Commands

```bash
npm install     # Install dependencies
npm run build   # Build library
npm run dev     # Watch mode
npm test        # Run tests
```

## Consumer Apps

| App | Repository | Editor |
|-----|------------|--------|
| Docs | `cloistr-docs` | TipTap + y-prosemirror |
| Sheets | `cloistr-sheets` | Univer + Yjs |
| Slides | `cloistr-slides` | Custom canvas + Yjs |
| Whiteboard | `cloistr-whiteboard` | Excalidraw + Yjs |

---

**Last Updated:** 2026-03-20

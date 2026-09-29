// Type definitions
export type {
  DocType,
  CollabDocState,
  SyncProvider,
  NostrSyncConfig,
  DocTypeMap,
  CollabDocConfig,
  CollabDocEvents,
  NostrUpdateMessage,
} from './types.js';

// Document management
export {
  createCollabDoc,
  getSharedType,
  serializeDoc,
  deserializeDoc,
  mergeDocuments,
  getStateVector,
  getUpdatesSinceStateVector,
  cloneDocument,
  getDocumentStats,
  validateUpdate,
  initializeDocumentContent,
} from './document.js';

// Browser-only (requires y-indexeddb)
export { initPersistence } from './document-browser.js';

export type { DocStats } from './document.js';

// Sync providers
export {
  NostrSyncProvider,
  createNostrSyncProvider,
} from './provider.js';

// React context and hooks
export {
  CollabDocProvider,
  useCollabDoc,
  useYjs,
  useSyncProvider,
  usePersistence,
  useSyncControls,
  useSharedType,
  useYjsSubscription,
} from './context.js';

// Re-export Yjs types that consumers commonly need
export type {
  Doc as YDoc,
  Text as YText,
  Map as YMap,
  Array as YArray,
} from 'yjs';
import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import {
  CollabDocState,
  CollabDocConfig,
  DocType,
  SyncProvider
} from './types.js';
import { createCollabDoc, initializeDocumentContent, initPersistence } from './document.js';
import { createNostrSyncProvider } from './provider.js';

interface CollabDocContextValue {
  state: CollabDocState;
  provider: SyncProvider | null;
  persistence: IndexeddbPersistence | null;
  updateState: (updates: Partial<CollabDocState>) => void;
}

const CollabDocContext = createContext<CollabDocContextValue | null>(null);

interface CollabDocProviderProps {
  children: ReactNode;
  config: CollabDocConfig;
}

/**
 * Provider component that manages a collaborative document with Yjs and Nostr sync
 */
export function CollabDocProvider({ children, config }: CollabDocProviderProps) {
  const [state, setState] = useState<CollabDocState>({
    ydoc: null,
    docId: config.docId,
    docType: config.docType,
    isLoaded: false,
    isSynced: false,
    peerCount: 0,
    lastSyncAt: null,
    syncError: null,
  });

  const providerRef = useRef<SyncProvider | null>(null);
  const persistenceRef = useRef<IndexeddbPersistence | null>(null);
  const docRef = useRef<Y.Doc | null>(null);

  const updateState = (updates: Partial<CollabDocState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  // Initialize document and providers
  useEffect(() => {
    let isMounted = true;

    const initializeDoc = async () => {
      try {
        console.log(`[CollabDoc] Initializing document: ${config.docId}`);

        // Create Yjs document
        const ydoc = createCollabDoc(config.docId, config.docType);
        docRef.current = ydoc;

        // Apply initial state if provided
        if (config.initialState) {
          Y.applyUpdate(ydoc, config.initialState);
        } else {
          // Initialize with default content
          initializeDocumentContent(ydoc, config.docType);
        }

        // Set up persistence if enabled
        if (config.persist !== false) {
          const persistence = initPersistence(ydoc, config.docId);
          persistenceRef.current = persistence;

          persistence.on('synced', () => {
            console.log(`[CollabDoc] Local persistence synced for ${config.docId}`);
            if (isMounted) {
              updateState({ isLoaded: true });
            }
          });
        }

        // Set up sync provider if configured
        if (config.syncConfig) {
          const provider = createNostrSyncProvider(ydoc, config.syncConfig);
          providerRef.current = provider;

          // Set up provider event handlers
          provider.onConnect = () => {
            console.log(`[CollabDoc] Sync provider connected for ${config.docId}`);
            if (isMounted) {
              updateState({
                isSynced: true,
                lastSyncAt: new Date(),
                syncError: null
              });
            }
          };

          provider.onDisconnect = () => {
            console.log(`[CollabDoc] Sync provider disconnected for ${config.docId}`);
            if (isMounted) {
              updateState({ isSynced: false });
            }
          };

          provider.onPeersChange = (peerCount: number) => {
            if (isMounted) {
              updateState({ peerCount });
            }
          };

          provider.onError = (error: Error) => {
            console.error(`[CollabDoc] Sync error for ${config.docId}:`, error);
            if (isMounted) {
              updateState({
                syncError: error.message,
                isSynced: false
              });
            }
          };

          provider.onUpdate = () => {
            if (isMounted) {
              updateState({ lastSyncAt: new Date() });
            }
          };

          // Connect to sync provider
          await provider.connect();
        }

        // Update state with initialized document
        if (isMounted) {
          updateState({
            ydoc,
            isLoaded: config.persist === false || !persistenceRef.current,
            isSynced: !config.syncConfig || !!providerRef.current?.connected,
          });
        }

        console.log(`[CollabDoc] Document initialized: ${config.docId}`);

      } catch (error) {
        console.error(`[CollabDoc] Initialization failed for ${config.docId}:`, error);
        if (isMounted) {
          updateState({
            syncError: error instanceof Error ? error.message : 'Initialization failed'
          });
        }
      }
    };

    initializeDoc();

    // Cleanup function
    return () => {
      isMounted = false;

      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }

      if (persistenceRef.current) {
        persistenceRef.current.destroy();
        persistenceRef.current = null;
      }

      if (docRef.current) {
        docRef.current.destroy();
        docRef.current = null;
      }

      console.log(`[CollabDoc] Cleaned up document: ${config.docId}`);
    };
  }, [config.docId, config.docType]); // Re-initialize if doc ID or type changes

  const contextValue: CollabDocContextValue = {
    state,
    provider: providerRef.current,
    persistence: persistenceRef.current,
    updateState,
  };

  return (
    <CollabDocContext.Provider value={contextValue}>
      {children}
    </CollabDocContext.Provider>
  );
}

/**
 * Hook to access the collaborative document state
 */
export function useCollabDoc(): CollabDocState {
  const context = useContext(CollabDocContext);

  if (!context) {
    throw new Error('useCollabDoc must be used within a CollabDocProvider');
  }

  return context.state;
}

/**
 * Hook to access the Yjs document directly
 */
export function useYjs(): Y.Doc | null {
  const context = useContext(CollabDocContext);

  if (!context) {
    throw new Error('useYjs must be used within a CollabDocProvider');
  }

  return context.state.ydoc;
}

/**
 * Hook to access the sync provider
 */
export function useSyncProvider(): SyncProvider | null {
  const context = useContext(CollabDocContext);

  if (!context) {
    throw new Error('useSyncProvider must be used within a CollabDocProvider');
  }

  return context.provider;
}

/**
 * Hook to access persistence layer
 */
export function usePersistence(): IndexeddbPersistence | null {
  const context = useContext(CollabDocContext);

  if (!context) {
    throw new Error('usePersistence must be used within a CollabDocProvider');
  }

  return context.persistence;
}

/**
 * Hook to manually trigger sync operations
 */
export function useSyncControls() {
  const context = useContext(CollabDocContext);

  if (!context) {
    throw new Error('useSyncControls must be used within a CollabDocProvider');
  }

  const { provider, updateState } = context;

  const reconnect = async () => {
    if (!provider) return;

    try {
      await provider.disconnect();
      await provider.connect();
    } catch (error) {
      console.error('[CollabDoc] Manual reconnection failed:', error);
      updateState({
        syncError: error instanceof Error ? error.message : 'Reconnection failed'
      });
    }
  };

  const clearError = () => {
    updateState({ syncError: null });
  };

  return {
    reconnect,
    clearError,
    connected: provider?.connected ?? false,
    peerCount: provider?.peerCount ?? 0,
  };
}

/**
 * Hook to get typed shared objects for specific document types
 */
export function useSharedType<T extends DocType>(docType: T): ReturnType<typeof import('./document.js').getSharedType<T>> | null {
  const ydoc = useYjs();

  if (!ydoc) {
    return null;
  }

  // Dynamic import to avoid circular dependency
  const { getSharedType } = require('./document.js');
  return getSharedType(ydoc, docType);
}

/**
 * Hook to subscribe to document changes with automatic cleanup
 */
export function useYjsSubscription<T>(
  selector: (ydoc: Y.Doc) => T | null,
  callback: (data: T) => void,
  dependencies: React.DependencyList = []
) {
  const ydoc = useYjs();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!ydoc) return;

    const data = selector(ydoc);
    if (!data) return;

    const handleUpdate = () => {
      const newData = selector(ydoc);
      if (newData) {
        callbackRef.current(newData);
      }
    };

    // Subscribe to document updates
    ydoc.on('update', handleUpdate);

    // Initial call
    handleUpdate();

    return () => {
      ydoc.off('update', handleUpdate);
    };
  }, [ydoc, ...dependencies]);
}
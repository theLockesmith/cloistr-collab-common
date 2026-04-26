/**
 * @fileoverview React context for relay pool management
 * Provides NostrProvider component and useRelayPool hook
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Event, Filter } from 'nostr-tools';
import { RelayPool, createRelayPool } from './pool.js';
import type {
  RelayPoolConfig,
  RelayPoolState,
  RelayPoolContextValue,
  SubscriptionHandle,
  SubscribeOptions,
  PublishOptions,
  PublishResult,
} from './types.js';

/**
 * React context for relay pool
 */
const RelayPoolContext = createContext<RelayPoolContextValue | null>(null);

/**
 * Props for NostrProvider component
 */
export interface NostrProviderProps {
  /** Relay pool configuration */
  config: RelayPoolConfig;
  /** Child components */
  children: React.ReactNode;
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
}

/**
 * Provider component for relay pool
 * Wrap your app with this to enable relay connectivity
 */
export function NostrProvider({ config, children, autoConnect = true }: NostrProviderProps) {
  const poolRef = useRef<RelayPool | null>(null);
  const [state, setState] = useState<RelayPoolState>({
    relays: new Map(),
    connectedCount: 0,
    totalCount: config.relayUrls.length,
    isInitializing: true,
    isConnected: false,
    error: null,
  });

  // Initialize pool
  useEffect(() => {
    const pool = createRelayPool(config, {
      onConnect: (url) => {
        console.log(`[NostrProvider] Relay connected: ${url}`);
        updateState();
      },
      onDisconnect: (url) => {
        console.log(`[NostrProvider] Relay disconnected: ${url}`);
        updateState();
      },
      onError: (url, error) => {
        console.error(`[NostrProvider] Relay error (${url}):`, error);
        updateState();
      },
      onHealthChange: (url, health) => {
        console.log(`[NostrProvider] Relay health changed (${url}):`, health);
        updateState();
      },
      onPoolStatusChange: (connected, total) => {
        console.log(`[NostrProvider] Pool status: ${connected}/${total} connected`);
      },
    });

    poolRef.current = pool;

    const updateState = () => {
      const poolState = pool.getState();
      const { connected, total } = pool.getCounts();
      setState({
        relays: poolState,
        connectedCount: connected,
        totalCount: total,
        isInitializing: false,
        isConnected: connected > 0,
        error: null,
      });
    };

    if (autoConnect) {
      pool.connect()
        .then(() => {
          updateState();
        })
        .catch((error) => {
          setState(prev => ({
            ...prev,
            isInitializing: false,
            error: error instanceof Error ? error.message : 'Connection failed',
          }));
        });
    } else {
      setState(prev => ({ ...prev, isInitializing: false }));
    }

    return () => {
      pool.destroy();
      poolRef.current = null;
    };
  }, [config.relayUrls.join(','), autoConnect]);

  // Subscribe function
  const subscribe = useCallback(
    (
      filters: Filter[],
      onEvent: (event: Event) => void,
      options?: SubscribeOptions
    ): SubscriptionHandle => {
      if (!poolRef.current) {
        return {
          id: 'noop',
          relays: [],
          close: () => {},
        };
      }
      return poolRef.current.subscribe(filters, onEvent, options);
    },
    []
  );

  // Publish function
  const publish = useCallback(
    async (event: Event, options?: PublishOptions): Promise<PublishResult> => {
      if (!poolRef.current) {
        return {
          success: false,
          accepted: [],
          rejected: [{ url: 'pool', reason: 'Pool not initialized' }],
          timedOut: [],
        };
      }
      return poolRef.current.publish(event, options);
    },
    []
  );

  // Get connected relays
  const getConnectedRelays = useCallback((): string[] => {
    return poolRef.current?.getConnectedRelays() || [];
  }, []);

  // Get healthy relays
  const getHealthyRelays = useCallback((): string[] => {
    return poolRef.current?.getHealthyRelays() || [];
  }, []);

  // Reconnect specific relay
  const reconnect = useCallback(async (url: string): Promise<void> => {
    if (!poolRef.current) return;
    await poolRef.current.connectRelay(url);
  }, []);

  // Reconnect all relays
  const reconnectAll = useCallback(async (): Promise<void> => {
    if (!poolRef.current) return;
    await poolRef.current.reconnectAll();
  }, []);

  // Add relay
  const addRelay = useCallback(async (url: string): Promise<void> => {
    if (!poolRef.current) return;
    await poolRef.current.addRelay(url);
    const poolState = poolRef.current.getState();
    const { connected, total } = poolRef.current.getCounts();
    setState(prev => ({
      ...prev,
      relays: poolState,
      connectedCount: connected,
      totalCount: total,
      isConnected: connected > 0,
    }));
  }, []);

  // Remove relay
  const removeRelay = useCallback((url: string): void => {
    if (!poolRef.current) return;
    poolRef.current.removeRelay(url);
    const poolState = poolRef.current.getState();
    const { connected, total } = poolRef.current.getCounts();
    setState(prev => ({
      ...prev,
      relays: poolState,
      connectedCount: connected,
      totalCount: total,
      isConnected: connected > 0,
    }));
  }, []);

  // Memoize context value
  const contextValue = useMemo<RelayPoolContextValue>(
    () => ({
      state,
      subscribe,
      publish,
      getConnectedRelays,
      getHealthyRelays,
      reconnect,
      reconnectAll,
      addRelay,
      removeRelay,
    }),
    [state, subscribe, publish, getConnectedRelays, getHealthyRelays, reconnect, reconnectAll, addRelay, removeRelay]
  );

  return (
    <RelayPoolContext.Provider value={contextValue}>
      {children}
    </RelayPoolContext.Provider>
  );
}

/**
 * Hook to access the relay pool
 * Must be used within a NostrProvider
 */
export function useRelayPool(): RelayPoolContextValue {
  const context = useContext(RelayPoolContext);
  if (!context) {
    throw new Error('useRelayPool must be used within a NostrProvider');
  }
  return context;
}

/**
 * Hook to check if relay pool is available (optional usage)
 */
export function useRelayPoolOptional(): RelayPoolContextValue | null {
  return useContext(RelayPoolContext);
}

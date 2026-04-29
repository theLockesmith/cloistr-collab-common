/**
 * @fileoverview React hooks for relay pool operations
 * Provides convenient hooks for common relay operations
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Event, Filter } from 'nostr-tools';
import { useRelayPool } from './context.js';
import type { SubscribeOptions, PublishResult, RelayState } from './types.js';

/**
 * Hook for subscribing to Nostr events
 * Automatically manages subscription lifecycle
 */
export function useSubscription(
  filters: Filter[],
  options?: SubscribeOptions & { enabled?: boolean }
): {
  events: Event[];
  isLoading: boolean;
  error: string | null;
} {
  const { subscribe, state } = useRelayPool();
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filterKey = JSON.stringify(filters);
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled || !state.isConnected) {
      return;
    }

    setIsLoading(true);
    setError(null);
    const eventSet = new Set<string>();

    const sub = subscribe(
      filters,
      (event) => {
        if (!eventSet.has(event.id)) {
          eventSet.add(event.id);
          setEvents(prev => [...prev, event]);
        }
      },
      {
        ...options,
        oneose: () => {
          setIsLoading(false);
          options?.oneose?.();
        },
      }
    );

    return () => {
      sub.close();
    };
  }, [filterKey, state.isConnected, enabled]);

  return { events, isLoading, error };
}

/**
 * Hook for publishing events
 */
export function usePublish(): {
  publish: (event: Event) => Promise<PublishResult>;
  isPublishing: boolean;
  lastResult: PublishResult | null;
} {
  const { publish: poolPublish } = useRelayPool();
  const [isPublishing, setIsPublishing] = useState(false);
  const [lastResult, setLastResult] = useState<PublishResult | null>(null);

  const publish = useCallback(async (event: Event): Promise<PublishResult> => {
    setIsPublishing(true);
    try {
      const result = await poolPublish(event);
      setLastResult(result);
      return result;
    } finally {
      setIsPublishing(false);
    }
  }, [poolPublish]);

  return { publish, isPublishing, lastResult };
}

/**
 * Hook for monitoring relay connection status
 */
export function useRelayStatus(): {
  isConnected: boolean;
  connectedCount: number;
  totalCount: number;
  relays: Map<string, RelayState>;
  isInitializing: boolean;
} {
  const { state } = useRelayPool();

  return {
    isConnected: state.isConnected,
    connectedCount: state.connectedCount,
    totalCount: state.totalCount,
    relays: state.relays,
    isInitializing: state.isInitializing,
  };
}

/**
 * Hook for monitoring a specific relay
 */
export function useRelayState(url: string): RelayState | null {
  const { state } = useRelayPool();
  return state.relays.get(url) || null;
}

/**
 * Hook for fetching a single event by ID
 */
export function useEvent(
  eventId: string | undefined,
  options?: { relayUrls?: string[] }
): {
  event: Event | null;
  isLoading: boolean;
  error: string | null;
} {
  const [event, setEvent] = useState<Event | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { subscribe, state } = useRelayPool();

  useEffect(() => {
    if (!eventId || !state.isConnected) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setEvent(null);

    const filters: Filter[] = [{ ids: [eventId] }];

    const sub = subscribe(
      filters,
      (receivedEvent) => {
        if (receivedEvent.id === eventId) {
          setEvent(receivedEvent);
          setIsLoading(false);
          sub.close();
        }
      },
      {
        relayUrls: options?.relayUrls,
        oneose: () => {
          setIsLoading(false);
          if (!event) {
            setError('Event not found');
          }
        },
      }
    );

    // Timeout after 10 seconds
    const timeout = setTimeout(() => {
      if (isLoading) {
        setIsLoading(false);
        setError('Request timed out');
        sub.close();
      }
    }, 10000);

    return () => {
      clearTimeout(timeout);
      sub.close();
    };
  }, [eventId, state.isConnected, options?.relayUrls?.join(',')]);

  return { event, isLoading, error };
}

/**
 * Hook for fetching events by author
 */
export function useAuthorEvents(
  pubkey: string | undefined,
  options?: {
    kinds?: number[];
    limit?: number;
    since?: number;
    until?: number;
    enabled?: boolean;
  }
): {
  events: Event[];
  isLoading: boolean;
  error: string | null;
} {
  const enabled = options?.enabled ?? true;

  const filters: Filter[] = pubkey
    ? [
        {
          authors: [pubkey],
          kinds: options?.kinds,
          limit: options?.limit,
          since: options?.since,
          until: options?.until,
        },
      ]
    : [];

  return useSubscription(filters, { enabled: enabled && !!pubkey });
}

/**
 * Hook for real-time event stream
 * Continuously receives new events matching the filter
 */
export function useEventStream(
  filters: Filter[],
  onEvent: (event: Event) => void,
  options?: { enabled?: boolean }
): {
  isConnected: boolean;
  relayCount: number;
} {
  const { subscribe, state } = useRelayPool();
  const onEventRef = useRef(onEvent);
  const enabled = options?.enabled ?? true;

  // Keep callback ref updated
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !state.isConnected) {
      return;
    }

    const sub = subscribe(filters, (event) => {
      onEventRef.current(event);
    });

    return () => {
      sub.close();
    };
  }, [JSON.stringify(filters), state.isConnected, enabled]);

  return {
    isConnected: state.isConnected,
    relayCount: state.connectedCount,
  };
}

/**
 * Hook for managing relay list
 */
export function useRelayList(): {
  relays: string[];
  connectedRelays: string[];
  addRelay: (url: string) => Promise<void>;
  removeRelay: (url: string) => void;
  reconnectRelay: (url: string) => Promise<void>;
  reconnectAll: () => Promise<void>;
} {
  const { state, addRelay, removeRelay, reconnect, reconnectAll, getConnectedRelays } = useRelayPool();

  return {
    relays: Array.from(state.relays.keys()),
    connectedRelays: getConnectedRelays(),
    addRelay,
    removeRelay,
    reconnectRelay: reconnect,
    reconnectAll,
  };
}

/**
 * Hook for fetching user relay preferences
 * Queries discovery service, then falls back to direct relay queries
 */
export function useRelayPrefsHook(
  pubkey: string | undefined,
  config?: {
    discoveryUrl?: string;
    defaultRelay?: string;
    cacheTtl?: number;
    queryTimeout?: number;
  }
): {
  prefs: import('./relay-prefs.js').RelayPrefs | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { subscribe, state } = useRelayPool();
  const [prefs, setPrefs] = useState<import('./relay-prefs.js').RelayPrefs | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  const refetch = useCallback(() => {
    setFetchCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!pubkey) {
      setPrefs(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    // Dynamically import to avoid circular dependencies
    import('./relay-prefs.js').then(({ getRelayPrefs, invalidateCache }) => {
      if (cancelled) return;

      // Invalidate cache on refetch
      if (fetchCount > 0) {
        invalidateCache(pubkey);
      }

      // Create a relay pool adapter for direct queries
      const poolAdapter = state.isConnected
        ? {
            subscribe: (
              filters: Filter[],
              onEvent: (event: Event) => void,
              options?: { oneose?: () => void }
            ) => subscribe(filters, onEvent, options),
          }
        : undefined;

      getRelayPrefs(pubkey, config, poolAdapter)
        .then((result) => {
          if (!cancelled) {
            setPrefs(result);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setError(err);
            setLoading(false);
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [pubkey, state.isConnected, fetchCount, JSON.stringify(config)]);

  return { prefs, loading, error, refetch };
}

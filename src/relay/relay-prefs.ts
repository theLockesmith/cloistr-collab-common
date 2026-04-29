/**
 * @fileoverview Relay Preferences module
 * Mirrors cloistr-common/relayprefs for TypeScript/JavaScript services.
 *
 * Provides user relay preference discovery via:
 * 1. Discovery service (fast path)
 * 2. Direct relay query for cloistr-relays (kind:30078)
 * 3. NIP-65 fallback (kind:10002)
 * 4. Default relay as final fallback
 *
 * See: ~/claude/coldforge/cloistr/architecture/relay-preferences.md
 */

import type { Event, Filter } from 'nostr-tools';

/**
 * Relay preference entry
 */
export interface RelayPref {
  url: string;
  read: boolean;
  write: boolean;
}

/**
 * Relay preferences result
 */
export interface RelayPrefs {
  /** Relays configured for reading */
  readRelays: string[];
  /** Relays configured for writing */
  writeRelays: string[];
  /** Source of the preferences (discovery, cloistr-relays, nip65, default) */
  source: 'discovery' | 'cloistr-relays' | 'nip65' | 'default';
  /** When these prefs were cached */
  cachedAt: number;
}

/**
 * Discovery service response
 */
interface DiscoveryResponse {
  relays: Array<{
    url: string;
    read: boolean;
    write: boolean;
  }>;
  source?: string;
}

/**
 * Relay preferences configuration
 */
export interface RelayPrefsConfig {
  /** Discovery service URL */
  discoveryUrl?: string;
  /** Default relay URL */
  defaultRelay?: string;
  /** Cache TTL in milliseconds */
  cacheTtl?: number;
  /** Timeout for queries in milliseconds */
  queryTimeout?: number;
}

/**
 * Event kind for cloistr relay preferences
 */
export const RELAY_PREFS_KIND = 30078;

/**
 * D-tag value for cloistr relay preferences
 */
export const RELAY_PREFS_D_TAG = 'cloistr-relays';

/**
 * NIP-65 relay list kind
 */
export const NIP65_KIND = 10002;

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<RelayPrefsConfig> = {
  discoveryUrl: 'https://discover.cloistr.xyz',
  defaultRelay: 'wss://relay.cloistr.xyz',
  cacheTtl: 60 * 60 * 1000, // 1 hour
  queryTimeout: 5000,
};

/**
 * In-memory cache for relay preferences
 */
const cache = new Map<string, RelayPrefs>();

/**
 * Get relay preferences for a pubkey
 *
 * Query chain:
 * 1. Check cache
 * 2. Query discovery service
 * 3. Query relay directly for cloistr-relays
 * 4. Query relay directly for NIP-65
 * 5. Return defaults
 */
export async function getRelayPrefs(
  pubkey: string,
  config: RelayPrefsConfig = {},
  relayPool?: {
    subscribe: (
      filters: Filter[],
      onEvent: (event: Event) => void,
      options?: { oneose?: () => void }
    ) => { close: () => void };
  }
): Promise<RelayPrefs> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (!pubkey) {
    return defaultPrefs(cfg);
  }

  // Check cache first
  const cached = getFromCache(pubkey, cfg);
  if (cached) {
    return cached;
  }

  // Try discovery service first (fast path)
  try {
    const prefs = await queryDiscovery(pubkey, cfg);
    if (prefs) {
      setCache(pubkey, prefs);
      return prefs;
    }
  } catch (err) {
    console.warn('RelayPrefs: Discovery query failed:', err);
  }

  // Try direct relay query if pool is available
  if (relayPool) {
    try {
      const prefs = await queryRelayDirect(pubkey, relayPool, cfg);
      if (prefs) {
        setCache(pubkey, prefs);
        return prefs;
      }
    } catch (err) {
      console.warn('RelayPrefs: Direct relay query failed:', err);
    }
  }

  // Final fallback: default relay
  const prefs = defaultPrefs(cfg);
  setCache(pubkey, prefs);
  return prefs;
}

/**
 * Query discovery service for relay preferences
 */
async function queryDiscovery(
  pubkey: string,
  config: Required<RelayPrefsConfig>
): Promise<RelayPrefs | null> {
  const url = `${config.discoveryUrl}/api/v1/relay-prefs/${pubkey}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.queryTimeout);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        return null; // No preferences found, not an error
      }
      throw new Error(`Discovery returned ${response.status}`);
    }

    const data: DiscoveryResponse = await response.json();
    return parseDiscoveryResponse(data);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parse discovery service response
 */
function parseDiscoveryResponse(data: DiscoveryResponse): RelayPrefs | null {
  if (!data || !data.relays || data.relays.length === 0) {
    return null;
  }

  const readRelays: string[] = [];
  const writeRelays: string[] = [];

  for (const relay of data.relays) {
    if (relay.read) {
      readRelays.push(relay.url);
    }
    if (relay.write) {
      writeRelays.push(relay.url);
    }
  }

  if (readRelays.length === 0 && writeRelays.length === 0) {
    return null;
  }

  return {
    readRelays,
    writeRelays,
    source: 'discovery',
    cachedAt: Date.now(),
  };
}

/**
 * Query relay directly for cloistr-relays or NIP-65 event
 */
async function queryRelayDirect(
  pubkey: string,
  relayPool: {
    subscribe: (
      filters: Filter[],
      onEvent: (event: Event) => void,
      options?: { oneose?: () => void }
    ) => { close: () => void };
  },
  config: Required<RelayPrefsConfig>
): Promise<RelayPrefs | null> {
  // First try cloistr-relays (kind:30078 d=cloistr-relays)
  let prefs = await queryForEvent(pubkey, RELAY_PREFS_KIND, RELAY_PREFS_D_TAG, relayPool, config);
  if (prefs) {
    prefs.source = 'cloistr-relays';
    return prefs;
  }

  // Fallback to NIP-65 (kind:10002)
  prefs = await queryForNIP65(pubkey, relayPool, config);
  if (prefs) {
    prefs.source = 'nip65';
    return prefs;
  }

  return null;
}

/**
 * Query for a specific addressable event
 */
function queryForEvent(
  pubkey: string,
  kind: number,
  dTag: string,
  relayPool: {
    subscribe: (
      filters: Filter[],
      onEvent: (event: Event) => void,
      options?: { oneose?: () => void }
    ) => { close: () => void };
  },
  config: Required<RelayPrefsConfig>
): Promise<RelayPrefs | null> {
  return new Promise((resolve) => {
    let resolved = false;
    let event: Event | null = null;

    const filter: Filter = {
      kinds: [kind],
      authors: [pubkey],
      '#d': [dTag],
      limit: 1,
    };

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        sub.close();
        resolve(event ? parseRelayTags(event.tags) : null);
      }
    }, config.queryTimeout);

    const sub = relayPool.subscribe(
      [filter],
      (e) => {
        if (!resolved) {
          event = e;
        }
      },
      {
        oneose: () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            sub.close();
            resolve(event ? parseRelayTags(event.tags) : null);
          }
        },
      }
    );
  });
}

/**
 * Query for NIP-65 relay list
 */
function queryForNIP65(
  pubkey: string,
  relayPool: {
    subscribe: (
      filters: Filter[],
      onEvent: (event: Event) => void,
      options?: { oneose?: () => void }
    ) => { close: () => void };
  },
  config: Required<RelayPrefsConfig>
): Promise<RelayPrefs | null> {
  return new Promise((resolve) => {
    let resolved = false;
    let event: Event | null = null;

    const filter: Filter = {
      kinds: [NIP65_KIND],
      authors: [pubkey],
      limit: 1,
    };

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        sub.close();
        resolve(event ? parseRelayTags(event.tags) : null);
      }
    }, config.queryTimeout);

    const sub = relayPool.subscribe(
      [filter],
      (e) => {
        if (!resolved) {
          event = e;
        }
      },
      {
        oneose: () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            sub.close();
            resolve(event ? parseRelayTags(event.tags) : null);
          }
        },
      }
    );
  });
}

/**
 * Parse relay tags from event (works for both cloistr-relays and NIP-65)
 */
function parseRelayTags(tags: string[][]): RelayPrefs | null {
  const readRelays: string[] = [];
  const writeRelays: string[] = [];

  for (const tag of tags) {
    if (tag[0] !== 'r') continue;

    const url = tag[1];
    if (!url || !url.startsWith('wss://')) continue;

    const marker = tag[2]; // 'read', 'write', or undefined (both)

    if (!marker || marker === 'read') {
      readRelays.push(url);
    }
    if (!marker || marker === 'write') {
      writeRelays.push(url);
    }
  }

  if (readRelays.length === 0 && writeRelays.length === 0) {
    return null;
  }

  return {
    readRelays,
    writeRelays,
    source: 'cloistr-relays', // Will be overwritten by caller
    cachedAt: Date.now(),
  };
}

/**
 * Default preferences (cloistr relay)
 */
function defaultPrefs(config: Required<RelayPrefsConfig>): RelayPrefs {
  return {
    readRelays: [config.defaultRelay],
    writeRelays: [config.defaultRelay],
    source: 'default',
    cachedAt: Date.now(),
  };
}

/**
 * Get from cache if not expired
 */
function getFromCache(
  pubkey: string,
  config: Required<RelayPrefsConfig>
): RelayPrefs | null {
  const entry = cache.get(pubkey);
  if (!entry) return null;

  // Check TTL
  if (Date.now() - entry.cachedAt > config.cacheTtl) {
    cache.delete(pubkey);
    return null;
  }

  return entry;
}

/**
 * Set cache entry
 */
function setCache(pubkey: string, prefs: RelayPrefs): void {
  cache.set(pubkey, prefs);
}

/**
 * Invalidate cache for a pubkey or all entries
 */
export function invalidateCache(pubkey?: string): void {
  if (pubkey) {
    cache.delete(pubkey);
  } else {
    cache.clear();
  }
}

/**
 * Create a cloistr-relays event for signing
 */
export function createRelayPrefsEvent(relays: RelayPref[]): Omit<Event, 'id' | 'sig' | 'pubkey'> {
  const tags: string[][] = [['d', RELAY_PREFS_D_TAG]];

  for (const relay of relays) {
    if (relay.read && relay.write) {
      tags.push(['r', relay.url]);
    } else if (relay.read) {
      tags.push(['r', relay.url, 'read']);
    } else if (relay.write) {
      tags.push(['r', relay.url, 'write']);
    }
  }

  return {
    kind: RELAY_PREFS_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: '',
  };
}

/**
 * React hook for relay preferences
 * Returns relay prefs for the current user
 */
export function useRelayPrefs(
  _pubkey: string | undefined,
  _config?: RelayPrefsConfig
): {
  prefs: RelayPrefs | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  // This will be implemented by importing React hooks
  // For now, provide a basic implementation
  throw new Error('useRelayPrefs requires React. Import from @cloistr/collab-common/react');
}

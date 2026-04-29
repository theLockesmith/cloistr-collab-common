/**
 * @fileoverview Relay module - Nostr relay pool management
 * Provides multi-relay connectivity with health tracking, circuit breaker,
 * and React integration for Cloistr collaboration apps.
 */

// Export types
export type {
  RelayStatus,
  RelayState,
  RelayPoolConfig,
  SubscriptionHandle,
  SubscribeOptions,
  PublishOptions,
  PublishResult,
  RelayPoolCallbacks,
  RelayPoolState,
  RelayPoolContextValue,
} from './types.js';

// Export relay pool
export { RelayPool, createRelayPool } from './pool.js';

// Export React context and provider
export { NostrProvider, useRelayPool, useRelayPoolOptional } from './context.js';
export type { NostrProviderProps } from './context.js';

// Export hooks
export {
  useSubscription,
  usePublish,
  useRelayStatus,
  useRelayState,
  useEvent,
  useAuthorEvents,
  useEventStream,
  useRelayList,
  useRelayPrefsHook,
} from './hooks.js';

// Export relay preferences
export {
  getRelayPrefs,
  invalidateCache,
  createRelayPrefsEvent,
  RELAY_PREFS_KIND,
  RELAY_PREFS_D_TAG,
  NIP65_KIND,
} from './relay-prefs.js';
export type {
  RelayPref,
  RelayPrefs,
  RelayPrefsConfig,
} from './relay-prefs.js';

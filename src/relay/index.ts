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
} from './hooks.js';

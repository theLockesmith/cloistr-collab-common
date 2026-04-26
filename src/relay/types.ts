/**
 * @fileoverview Type definitions for relay module
 * Provides relay pool management for Nostr connectivity
 */

import { Relay, Event, Filter } from 'nostr-tools';
import { RelayConfig, RelayHealth } from '../auth/types.js';

/**
 * Relay connection status
 */
export type RelayStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Individual relay state
 */
export interface RelayState {
  /** Relay URL */
  url: string;
  /** Connection status */
  status: RelayStatus;
  /** Underlying relay instance */
  relay: Relay | null;
  /** Health tracking */
  health: RelayHealth;
  /** Last error message */
  lastError?: string;
  /** Connection timestamp */
  connectedAt?: number;
}

/**
 * Relay pool configuration
 */
export interface RelayPoolConfig {
  /** List of relay URLs to connect to */
  relayUrls: string[];
  /** Circuit breaker and rate limiting configuration */
  healthConfig?: Partial<RelayConfig>;
  /** Connection timeout per relay (ms) */
  connectionTimeout?: number;
  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean;
  /** Reconnect delay (ms) */
  reconnectDelay?: number;
  /** Maximum reconnect attempts */
  maxReconnectAttempts?: number;
}

/**
 * Event subscription handle
 */
export interface SubscriptionHandle {
  /** Subscription ID */
  id: string;
  /** Close the subscription */
  close(): void;
  /** Relay URLs this subscription is active on */
  relays: string[];
}

/**
 * Subscription options
 */
export interface SubscribeOptions {
  /** Filter to specific relay URLs (default: all connected) */
  relayUrls?: string[];
  /** Called when subscription reaches end of stored events */
  oneose?: () => void;
  /** Called on subscription close */
  onclose?: () => void;
}

/**
 * Publish options
 */
export interface PublishOptions {
  /** Filter to specific relay URLs (default: all connected) */
  relayUrls?: string[];
  /** Required number of relay confirmations (default: 1) */
  requiredOks?: number;
  /** Timeout for publish confirmation (ms) */
  timeout?: number;
}

/**
 * Publish result
 */
export interface PublishResult {
  /** Whether publish was successful on at least requiredOks relays */
  success: boolean;
  /** Relays that accepted the event */
  accepted: string[];
  /** Relays that rejected the event with reason */
  rejected: { url: string; reason: string }[];
  /** Relays that timed out */
  timedOut: string[];
}

/**
 * Relay pool event callbacks
 */
export interface RelayPoolCallbacks {
  /** Called when a relay connects */
  onConnect?: (url: string) => void;
  /** Called when a relay disconnects */
  onDisconnect?: (url: string) => void;
  /** Called when a relay errors */
  onError?: (url: string, error: Error) => void;
  /** Called when relay health changes */
  onHealthChange?: (url: string, health: RelayHealth) => void;
  /** Called when pool connectivity changes */
  onPoolStatusChange?: (connectedCount: number, totalCount: number) => void;
}

/**
 * Relay pool state for React context
 */
export interface RelayPoolState {
  /** Current relay states */
  relays: Map<string, RelayState>;
  /** Number of connected relays */
  connectedCount: number;
  /** Total number of configured relays */
  totalCount: number;
  /** Whether pool is initializing */
  isInitializing: boolean;
  /** Whether pool has at least one connection */
  isConnected: boolean;
  /** Pool-level error message */
  error: string | null;
}

/**
 * Relay pool context value
 */
export interface RelayPoolContextValue {
  /** Current pool state */
  state: RelayPoolState;
  /** Subscribe to events across relays */
  subscribe(
    filters: Filter[],
    onEvent: (event: Event) => void,
    options?: SubscribeOptions
  ): SubscriptionHandle;
  /** Publish event to relays */
  publish(event: Event, options?: PublishOptions): Promise<PublishResult>;
  /** Get connected relay URLs */
  getConnectedRelays(): string[];
  /** Get healthy relay URLs (sorted by performance) */
  getHealthyRelays(): string[];
  /** Manually reconnect a specific relay */
  reconnect(url: string): Promise<void>;
  /** Reconnect all relays */
  reconnectAll(): Promise<void>;
  /** Add a relay to the pool */
  addRelay(url: string): Promise<void>;
  /** Remove a relay from the pool */
  removeRelay(url: string): void;
}

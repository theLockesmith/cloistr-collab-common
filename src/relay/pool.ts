/**
 * @fileoverview Relay pool implementation for managing multiple Nostr relay connections
 * Provides health tracking, circuit breaker, and automatic reconnection
 */

import { Relay, Event, Filter } from 'nostr-tools';
import { RelayHealthManager } from '../auth/relay-health.js';
import type {
  RelayPoolConfig,
  RelayState,
  RelayPoolCallbacks,
  SubscriptionHandle,
  SubscribeOptions,
  PublishOptions,
  PublishResult,
} from './types.js';

/**
 * Manages a pool of Nostr relay connections with health tracking
 */
export class RelayPool {
  private relays = new Map<string, RelayState>();
  private healthManager: RelayHealthManager;
  private config: Required<RelayPoolConfig>;
  private callbacks: RelayPoolCallbacks = {};
  private subscriptionCounter = 0;
  private reconnectTimers = new Map<string, NodeJS.Timeout>();
  private reconnectAttempts = new Map<string, number>();

  constructor(config: RelayPoolConfig, callbacks?: RelayPoolCallbacks) {
    this.config = {
      relayUrls: config.relayUrls,
      healthConfig: config.healthConfig || {},
      connectionTimeout: config.connectionTimeout ?? 10000,
      autoReconnect: config.autoReconnect ?? true,
      reconnectDelay: config.reconnectDelay ?? 3000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
    };
    this.healthManager = new RelayHealthManager(this.config.healthConfig);
    this.callbacks = callbacks || {};

    // Initialize relay states
    for (const url of this.config.relayUrls) {
      this.initRelayState(url);
    }
  }

  /**
   * Initialize relay state entry
   */
  private initRelayState(url: string): void {
    this.relays.set(url, {
      url,
      status: 'disconnected',
      relay: null,
      health: this.healthManager.getRelayHealth(url),
    });
  }

  /**
   * Connect to all configured relays
   */
  async connect(): Promise<void> {
    const connectPromises = Array.from(this.relays.keys()).map(url =>
      this.connectRelay(url).catch(err => {
        console.warn(`[RelayPool] Failed to connect to ${url}:`, err.message);
      })
    );
    await Promise.allSettled(connectPromises);
    this.emitPoolStatusChange();
  }

  /**
   * Connect to a specific relay
   */
  async connectRelay(url: string): Promise<void> {
    const state = this.relays.get(url);
    if (!state) {
      this.initRelayState(url);
    }

    // Check health before connecting
    if (!this.healthManager.isHealthy(url)) {
      console.log(`[RelayPool] Skipping unhealthy relay: ${url}`);
      return;
    }

    const relayState = this.relays.get(url)!;
    if (relayState.status === 'connected' || relayState.status === 'connecting') {
      return;
    }

    relayState.status = 'connecting';

    try {
      // Wait for any throttle delay
      await this.healthManager.waitForThrottle(url);

      // Connect with timeout
      const relay = await Promise.race([
        Relay.connect(url),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), this.config.connectionTimeout)
        ),
      ]);

      relayState.relay = relay;
      relayState.status = 'connected';
      relayState.connectedAt = Date.now();
      relayState.lastError = undefined;

      // Record success
      this.healthManager.recordSuccess(url);
      relayState.health = this.healthManager.getRelayHealth(url);

      // Reset reconnect attempts on successful connection
      this.reconnectAttempts.delete(url);

      // Set up disconnect handler
      relay.onclose = () => {
        console.log(`[RelayPool] Relay disconnected: ${url}`);
        relayState.status = 'disconnected';
        relayState.relay = null;
        this.callbacks.onDisconnect?.(url);
        this.emitPoolStatusChange();

        if (this.config.autoReconnect) {
          this.scheduleReconnect(url);
        }
      };

      console.log(`[RelayPool] Connected to ${url}`);
      this.callbacks.onConnect?.(url);
      this.emitPoolStatusChange();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      relayState.status = 'error';
      relayState.lastError = errorMessage;

      this.healthManager.recordFailure(url, errorMessage);
      relayState.health = this.healthManager.getRelayHealth(url);

      this.callbacks.onError?.(url, error as Error);
      this.callbacks.onHealthChange?.(url, relayState.health);

      if (this.config.autoReconnect) {
        this.scheduleReconnect(url);
      }

      throw error;
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(url: string): void {
    // Clear any existing timer
    const existingTimer = this.reconnectTimers.get(url);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const attempts = this.reconnectAttempts.get(url) || 0;
    if (attempts >= this.config.maxReconnectAttempts) {
      console.warn(`[RelayPool] Max reconnect attempts reached for ${url}`);
      return;
    }

    // Exponential backoff with jitter
    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(2, attempts) + Math.random() * 1000,
      30000 // Max 30 seconds
    );

    console.log(`[RelayPool] Scheduling reconnect to ${url} in ${Math.round(delay)}ms (attempt ${attempts + 1})`);

    const timer = setTimeout(async () => {
      this.reconnectAttempts.set(url, attempts + 1);
      try {
        await this.connectRelay(url);
      } catch (err) {
        // Failure is handled in connectRelay, which will schedule another attempt
      }
    }, delay);

    this.reconnectTimers.set(url, timer);
  }

  /**
   * Disconnect from all relays
   */
  async disconnect(): Promise<void> {
    // Clear all reconnect timers
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();
    this.reconnectAttempts.clear();

    // Disconnect all relays
    for (const [url, state] of this.relays) {
      if (state.relay) {
        try {
          await state.relay.close();
        } catch (err) {
          console.warn(`[RelayPool] Error closing ${url}:`, err);
        }
        state.relay = null;
        state.status = 'disconnected';
      }
    }

    this.emitPoolStatusChange();
  }

  /**
   * Disconnect and reconnect all relays
   */
  async reconnectAll(): Promise<void> {
    await this.disconnect();
    this.healthManager.resetAll();
    await this.connect();
  }

  /**
   * Add a new relay to the pool
   */
  async addRelay(url: string): Promise<void> {
    if (this.relays.has(url)) {
      return;
    }
    this.initRelayState(url);
    await this.connectRelay(url);
  }

  /**
   * Remove a relay from the pool
   */
  removeRelay(url: string): void {
    const state = this.relays.get(url);
    if (!state) {
      return;
    }

    // Clear reconnect timer
    const timer = this.reconnectTimers.get(url);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(url);
    }

    // Close connection
    if (state.relay) {
      state.relay.close();
    }

    this.relays.delete(url);
    this.emitPoolStatusChange();
  }

  /**
   * Subscribe to events across connected relays
   */
  subscribe(
    filters: Filter[],
    onEvent: (event: Event) => void,
    options: SubscribeOptions = {}
  ): SubscriptionHandle {
    const id = `sub_${++this.subscriptionCounter}`;
    const targetUrls = options.relayUrls || this.getConnectedRelays();
    const subscriptions: Array<{ relay: Relay; sub: ReturnType<Relay['subscribe']> }> = [];
    const seenEvents = new Set<string>();
    let eoseCount = 0;

    for (const url of targetUrls) {
      const state = this.relays.get(url);
      if (!state?.relay || state.status !== 'connected') {
        continue;
      }

      const sub = state.relay.subscribe(filters, {
        onevent: (event: Event) => {
          // Deduplicate events across relays
          if (seenEvents.has(event.id)) {
            return;
          }
          seenEvents.add(event.id);
          onEvent(event);
        },
        oneose: () => {
          eoseCount++;
          if (eoseCount === subscriptions.length) {
            options.oneose?.();
          }
        },
        onclose: () => {
          if (subscriptions.length === 1) {
            options.onclose?.();
          }
        },
      });

      subscriptions.push({ relay: state.relay, sub });
    }

    return {
      id,
      relays: targetUrls,
      close: () => {
        for (const { sub } of subscriptions) {
          sub.close();
        }
      },
    };
  }

  /**
   * Publish an event to relays
   */
  async publish(event: Event, options: PublishOptions = {}): Promise<PublishResult> {
    const targetUrls = options.relayUrls || this.getConnectedRelays();
    const requiredOks = options.requiredOks ?? 1;
    const timeout = options.timeout ?? 5000;

    const accepted: string[] = [];
    const rejected: { url: string; reason: string }[] = [];
    const timedOut: string[] = [];

    const publishPromises = targetUrls.map(async (url) => {
      const state = this.relays.get(url);
      if (!state?.relay || state.status !== 'connected') {
        rejected.push({ url, reason: 'Not connected' });
        return;
      }

      try {
        // Wait for throttle
        await this.healthManager.waitForThrottle(url);

        await Promise.race([
          state.relay.publish(event),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Publish timeout')), timeout)
          ),
        ]);

        accepted.push(url);
        this.healthManager.recordSuccess(url);
        state.health = this.healthManager.getRelayHealth(url);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage.includes('timeout')) {
          timedOut.push(url);
        } else {
          rejected.push({ url, reason: errorMessage });
        }

        this.healthManager.recordFailure(url, errorMessage);
        state.health = this.healthManager.getRelayHealth(url);
        this.callbacks.onHealthChange?.(url, state.health);
      }
    });

    await Promise.allSettled(publishPromises);

    return {
      success: accepted.length >= requiredOks,
      accepted,
      rejected,
      timedOut,
    };
  }

  /**
   * Get list of connected relay URLs
   */
  getConnectedRelays(): string[] {
    return Array.from(this.relays.entries())
      .filter(([_, state]) => state.status === 'connected')
      .map(([url]) => url);
  }

  /**
   * Get healthy relays sorted by performance (lowest throttle first)
   */
  getHealthyRelays(): string[] {
    return this.healthManager.getHealthyRelaysSorted(
      Array.from(this.relays.keys())
    );
  }

  /**
   * Get current state of all relays
   */
  getState(): Map<string, RelayState> {
    return new Map(this.relays);
  }

  /**
   * Get connected count and total count
   */
  getCounts(): { connected: number; total: number } {
    const connected = this.getConnectedRelays().length;
    return { connected, total: this.relays.size };
  }

  /**
   * Emit pool status change callback
   */
  private emitPoolStatusChange(): void {
    const { connected, total } = this.getCounts();
    this.callbacks.onPoolStatusChange?.(connected, total);
  }

  /**
   * Destroy the pool and clean up resources
   */
  destroy(): void {
    this.disconnect();
  }
}

/**
 * Create a relay pool with the given configuration
 */
export function createRelayPool(
  config: RelayPoolConfig,
  callbacks?: RelayPoolCallbacks
): RelayPool {
  return new RelayPool(config, callbacks);
}

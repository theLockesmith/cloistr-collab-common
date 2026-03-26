/**
 * @fileoverview Relay health management with circuit breaker and adaptive rate limiting
 * Ported from cloistr-stash's robust NIP-46 implementation
 */

import { RelayHealth, RelayConfig } from './types.js';

/**
 * Default configuration for circuit breaker and rate limiting
 * These values are tuned for cloistr-signer's backoff behavior
 */
export const DEFAULT_RELAY_CONFIG: RelayConfig = {
  // Circuit breaker settings
  MAX_FAILURES: 5,           // Disable relay after N consecutive failures
  COOLDOWN_MS: 60000,        // Re-enable after 60 seconds

  // Throttling settings (adaptive rate limiting)
  // Keep these LOW - signer also has backoff, combined delay adds up fast
  MIN_THROTTLE_MS: 0,        // No delay when healthy
  MAX_THROTTLE_MS: 2000,     // Max 2s delay (conservative with signer backoff)
  THROTTLE_INCREASE: 250,    // Add 250ms per rate-limit hit
  THROTTLE_DECREASE: 100,    // Remove 100ms per success

  // Connection settings
  CONNECT_TIMEOUT_MS: 10000, // Per-relay connection timeout

  // Request timeout settings
  BASE_TIMEOUT_MS: 30000,    // Base timeout for NIP-46 requests
  THROTTLE_TIMEOUT_BUFFER: 3, // Multiply throttle by this for timeout buffer
};

/**
 * Manages relay health tracking, circuit breaker pattern, and adaptive rate limiting
 * Works WITH rate limits instead of fighting them
 */
export class RelayHealthManager {
  private relayHealth = new Map<string, RelayHealth>();
  private config: RelayConfig;

  constructor(config: Partial<RelayConfig> = {}) {
    this.config = { ...DEFAULT_RELAY_CONFIG, ...config };
  }

  /**
   * Get or create relay health record
   */
  getRelayHealth(url: string): RelayHealth {
    if (!this.relayHealth.has(url)) {
      this.relayHealth.set(url, {
        failures: 0,
        lastFailure: 0,
        disabled: false,
        throttleMs: 0,
        lastRequest: 0,
        rateLimited: false,
      });
    }
    return this.relayHealth.get(url)!;
  }

  /**
   * Record a relay success - reduce throttle, reset failures
   */
  recordSuccess(url: string): void {
    const health = this.getRelayHealth(url);
    health.failures = 0;
    health.disabled = false;
    health.rateLimited = false;
    // Gradually reduce throttle on success
    health.throttleMs = Math.max(
      this.config.MIN_THROTTLE_MS,
      health.throttleMs - this.config.THROTTLE_DECREASE
    );
  }

  /**
   * Record rate limiting - increase throttle (but don't circuit-break)
   */
  recordRateLimit(url: string): void {
    const health = this.getRelayHealth(url);
    health.rateLimited = true;
    health.lastFailure = Date.now();
    // Increase throttle to slow down requests
    health.throttleMs = Math.min(
      this.config.MAX_THROTTLE_MS,
      health.throttleMs + this.config.THROTTLE_INCREASE
    );
    console.warn(`[RelayHealth] Rate limited by ${url}, throttling to ${health.throttleMs}ms between requests`);
  }

  /**
   * Record a relay failure - may trigger circuit breaker
   */
  recordFailure(url: string, reason = 'unknown'): void {
    const health = this.getRelayHealth(url);
    health.failures++;
    health.lastFailure = Date.now();
    health.lastReason = reason;

    // Rate limit detection - handle separately, don't circuit-break
    const lowerReason = reason.toLowerCase();
    if (lowerReason.includes('rate') || lowerReason.includes('limit') || lowerReason.includes('429')) {
      this.recordRateLimit(url);
      return;
    }

    // Check circuit breaker threshold
    if (health.failures >= this.config.MAX_FAILURES) {
      health.disabled = true;
      console.warn(`[RelayHealth] Circuit breaker OPEN for ${url} (${health.failures} failures: ${reason})`);
    }
  }

  /**
   * Check if relay is healthy (not disabled or cooldown expired)
   */
  isHealthy(url: string): boolean {
    const health = this.getRelayHealth(url);

    if (health.disabled) {
      // Check if cooldown has expired
      if (Date.now() - health.lastFailure > this.config.COOLDOWN_MS) {
        console.log(`[RelayHealth] Circuit breaker HALF-OPEN for ${url} - allowing retry`);
        health.disabled = false;
        health.failures = Math.floor(health.failures / 2);
        health.throttleMs = Math.floor(health.throttleMs / 2);
        return true;
      }
      return false;
    }

    return true;
  }

  /**
   * Wait for throttle delay if needed (respects rate limits)
   */
  async waitForThrottle(url: string): Promise<void> {
    const health = this.getRelayHealth(url);
    if (health.throttleMs > 0) {
      const timeSinceLastRequest = Date.now() - health.lastRequest;
      const waitTime = Math.max(0, health.throttleMs - timeSinceLastRequest);
      if (waitTime > 0) {
        console.log(`[RelayHealth] Throttling ${url} for ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    health.lastRequest = Date.now();
  }

  /**
   * Calculate dynamic timeout based on current throttle state
   * Accounts for signer-side backoff too
   */
  getDynamicTimeout(): number {
    let maxThrottle = 0;
    for (const [, health] of this.relayHealth) {
      if (health.throttleMs > maxThrottle) {
        maxThrottle = health.throttleMs;
      }
    }
    // Base timeout + buffer for throttled relays
    // Account for signer-side backoff too (assume up to 15s signer delay when throttled)
    const signerBuffer = maxThrottle > 0 ? 15000 : 0;
    return this.config.BASE_TIMEOUT_MS +
           (maxThrottle * this.config.THROTTLE_TIMEOUT_BUFFER) +
           signerBuffer;
  }

  /**
   * Get list of healthy relay URLs from a given set
   */
  getHealthyRelays(urls: string[]): string[] {
    return urls.filter(url => this.isHealthy(url));
  }

  /**
   * Get healthy relays sorted by throttle (prefer faster relays)
   */
  getHealthyRelaysSorted(urls: string[]): string[] {
    return this.getHealthyRelays(urls).sort((a, b) => {
      const healthA = this.getRelayHealth(a);
      const healthB = this.getRelayHealth(b);
      return healthA.throttleMs - healthB.throttleMs;
    });
  }

  /**
   * Reset all circuit breakers (fresh start)
   */
  resetAll(): void {
    for (const [url, health] of this.relayHealth) {
      health.failures = 0;
      health.disabled = false;
      health.throttleMs = 0;
      health.rateLimited = false;
      console.log(`[RelayHealth] Reset circuit breaker for ${url}`);
    }
  }

  /**
   * Check if all relays are unhealthy
   */
  allUnhealthy(urls: string[]): boolean {
    return urls.every(url => !this.isHealthy(url));
  }

  /**
   * Get current configuration
   */
  getConfig(): RelayConfig {
    return { ...this.config };
  }
}

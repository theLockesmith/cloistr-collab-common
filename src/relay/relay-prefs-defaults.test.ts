import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { _defaultRelayPrefsConfig } from './relay-prefs.js';
import {
  _resetServiceConfig,
  RUNTIME_CONFIG_GLOBAL,
  DEFAULT_RELAY_URL,
  DEFAULT_DISCOVERY_URL,
} from '../config/index.js';

/**
 * Why this test exists.
 *
 * This module used to carry its own production discovery and relay literals.
 * That is a quiet way to defeat the whole runtime-config mechanism: an app
 * could adopt the container-start configuration, point itself at staging, and
 * still reach the production discovery service and the production relay
 * through this path, with nothing in the app's own code to show why.
 *
 * So the defaults here must come from the shared reader, and they must be read
 * when they are used rather than when the module is imported, because the
 * container writes its configuration before the bundle runs but modules are
 * imported in an order nobody controls.
 */
function setRuntimeConfig(value: unknown): void {
  (globalThis as any).window = { [RUNTIME_CONFIG_GLOBAL]: value };
}

beforeEach(() => {
  _resetServiceConfig();
  delete (globalThis as any).window;
});

afterEach(() => {
  delete (globalThis as any).window;
});

describe('relay preference defaults', () => {
  it('uses the production discovery service and relay when nothing is configured', () => {
    const config = _defaultRelayPrefsConfig();
    expect(config.discoveryUrl).toBe(DEFAULT_DISCOVERY_URL);
    expect(config.defaultRelay).toBe(DEFAULT_RELAY_URL);
  });

  it('follows runtime configuration instead of its own literals', () => {
    setRuntimeConfig({
      relayUrl: 'wss://relay.staging.test',
      discoveryUrl: 'https://discover.staging.test',
    });

    const config = _defaultRelayPrefsConfig();
    expect(config.defaultRelay).toBe('wss://relay.staging.test');
    expect(config.discoveryUrl).toBe('https://discover.staging.test');
  });

  it('does not reach production when only the relay is overridden', () => {
    setRuntimeConfig({ relayUrl: 'wss://relay.staging.test' });

    const config = _defaultRelayPrefsConfig();
    expect(config.defaultRelay).toBe('wss://relay.staging.test');
    expect(config.defaultRelay).not.toContain('cloistr.xyz');
  });

  it('is read at call time, not at import time', () => {
    // The container writes its configuration before the bundle runs, but module
    // import order is not something an app controls. Reading at import time
    // would make correctness depend on it.
    const before = _defaultRelayPrefsConfig();
    expect(before.defaultRelay).toBe(DEFAULT_RELAY_URL);

    _resetServiceConfig();
    setRuntimeConfig({ relayUrl: 'wss://relay.later.test' });

    const after = _defaultRelayPrefsConfig();
    expect(after.defaultRelay).toBe('wss://relay.later.test');
  });

  it('leaves the timing values alone', () => {
    const config = _defaultRelayPrefsConfig();
    expect(config.cacheTtl).toBe(60 * 60 * 1000);
    expect(config.queryTimeout).toBe(5000);
  });

  it('returns a fresh object each call, so a caller cannot mutate the defaults', () => {
    const first = _defaultRelayPrefsConfig();
    first.defaultRelay = 'wss://mutated.test';
    expect(_defaultRelayPrefsConfig().defaultRelay).toBe(DEFAULT_RELAY_URL);
  });
});

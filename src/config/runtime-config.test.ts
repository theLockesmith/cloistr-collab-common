import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getRuntimeConfig,
  getServiceConfig,
  useServiceConfig,
  _resetServiceConfig,
  RUNTIME_CONFIG_GLOBAL,
  DEFAULT_RELAY_URL,
  DEFAULT_BLOSSOM_URL,
  DEFAULT_DISCOVERY_URL,
  DEFAULT_SIGNER_URL,
  type RuntimeConfig,
} from './index.js';

/**
 * These tests run in the node environment, where there is no window. Each test
 * that needs one installs a minimal stand-in, because the only thing the reader
 * touches is the single global the container writes.
 */
function setRuntimeConfig(value: unknown): void {
  (globalThis as any).window = { [RUNTIME_CONFIG_GLOBAL]: value };
}

function setWindowWithoutConfig(): void {
  (globalThis as any).window = {};
}

beforeEach(() => {
  _resetServiceConfig();
  delete (globalThis as any).window;
  vi.restoreAllMocks();
});

afterEach(() => {
  delete (globalThis as any).window;
});

describe('the global name', () => {
  it('is the exact name the container template writes', () => {
    // Pinned deliberately. The nginx template emits this literal, and the two
    // cannot be kept in agreement by reading one of them.
    expect(RUNTIME_CONFIG_GLOBAL).toBe('__CLOISTR_CONFIG__');
  });
});

describe('getRuntimeConfig', () => {
  it('is empty when there is no window at all', () => {
    expect(getRuntimeConfig()).toEqual({});
  });

  it('is empty when the container wrote nothing', () => {
    setWindowWithoutConfig();
    expect(getRuntimeConfig()).toEqual({});
  });

  it('ignores a global that is not an object', () => {
    setRuntimeConfig('wss://relay.example.test');
    expect(getRuntimeConfig()).toEqual({});
  });

  it('ignores a null global', () => {
    setRuntimeConfig(null);
    expect(getRuntimeConfig()).toEqual({});
  });

  it('returns what the container wrote', () => {
    setRuntimeConfig({ relayUrl: 'wss://relay.staging.test' });
    expect(getRuntimeConfig()).toEqual({ relayUrl: 'wss://relay.staging.test' });
  });
});

describe('getServiceConfig with no runtime config', () => {
  it('returns the existing defaults, so an unconfigured image is unchanged', () => {
    const config = getServiceConfig();
    expect(config.relayUrl).toBe(DEFAULT_RELAY_URL);
    expect(config.blossomUrl).toBe(DEFAULT_BLOSSOM_URL);
    expect(config.discoveryUrl).toBe(DEFAULT_DISCOVERY_URL);
    expect(config.signerUrl).toBe(DEFAULT_SIGNER_URL);
  });

  it('reports production as the environment', () => {
    expect(getServiceConfig().environment).toBe('production');
  });

  it('has no service overrides, leaving the nav catalog in charge', () => {
    expect(getServiceConfig().services).toEqual({});
  });

  it('has no app URL', () => {
    expect(getServiceConfig().appUrl).toBeUndefined();
  });
});

describe('getServiceConfig with runtime config', () => {
  it('takes the relay from the container over the default', () => {
    setRuntimeConfig({ relayUrl: 'wss://relay.staging.test' });
    expect(getServiceConfig().relayUrl).toBe('wss://relay.staging.test');
  });

  it('takes every service from the container', () => {
    const runtime: RuntimeConfig = {
      relayUrl: 'wss://relay.staging.test',
      blossomUrl: 'https://files.staging.test',
      discoveryUrl: 'https://discover.staging.test',
      signerUrl: 'https://signer.staging.test',
      appUrl: 'https://sheets.staging.test',
      environment: 'staging',
    };
    setRuntimeConfig(runtime);

    const config = getServiceConfig();
    expect(config).toMatchObject({
      relayUrl: 'wss://relay.staging.test',
      blossomUrl: 'https://files.staging.test',
      discoveryUrl: 'https://discover.staging.test',
      signerUrl: 'https://signer.staging.test',
      appUrl: 'https://sheets.staging.test',
      environment: 'staging',
    });
  });

  it('passes service overrides through for cross-app navigation', () => {
    setRuntimeConfig({
      services: { docs: 'https://docs.staging.test', sheets: 'https://sheets.staging.test' },
    });
    expect(getServiceConfig().services).toEqual({
      docs: 'https://docs.staging.test',
      sheets: 'https://sheets.staging.test',
    });
  });

  it('treats an empty string as absent, not as an override to nothing', () => {
    setRuntimeConfig({ relayUrl: '', signerUrl: '' });
    const config = getServiceConfig();
    expect(config.relayUrl).toBe(DEFAULT_RELAY_URL);
    expect(config.signerUrl).toBe(DEFAULT_SIGNER_URL);
  });

  it('overrides only the fields it names, leaving the rest at their defaults', () => {
    setRuntimeConfig({ relayUrl: 'wss://relay.staging.test' });
    const config = getServiceConfig();
    expect(config.relayUrl).toBe('wss://relay.staging.test');
    expect(config.signerUrl).toBe(DEFAULT_SIGNER_URL);
    expect(config.blossomUrl).toBe(DEFAULT_BLOSSOM_URL);
  });

  it('ignores a non-string value rather than coercing it', () => {
    setRuntimeConfig({ relayUrl: 42 });
    expect(getServiceConfig().relayUrl).toBe(DEFAULT_RELAY_URL);
  });

  it('ignores a services value that is not an object', () => {
    setRuntimeConfig({ services: 'docs=https://docs.staging.test' });
    expect(getServiceConfig().services).toEqual({});
  });
});

describe('a malformed runtime value', () => {
  it('is USED, not replaced by the production default', () => {
    // The point of this test: falling back here would mean one typo in a
    // staging deployment silently sends traffic to production. A relay that
    // cannot connect is the lesser failure, and it is visible.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setRuntimeConfig({ relayUrl: 'https://relay.staging.test' });

    const config = getServiceConfig();
    expect(config.relayUrl).toBe('https://relay.staging.test');
    expect(config.relayUrl).not.toBe(DEFAULT_RELAY_URL);
    expect(spy).toHaveBeenCalled();
  });

  it('says which field was wrong and what was expected', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setRuntimeConfig({ relayUrl: 'https://relay.staging.test' });
    getServiceConfig();

    const message = spy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(message).toContain('relayUrl');
    expect(message).toContain('wss:');
  });

  it('complains about an unparseable URL and still uses it', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setRuntimeConfig({ signerUrl: 'not a url at all' });

    expect(getServiceConfig().signerUrl).toBe('not a url at all');
    expect(spy).toHaveBeenCalled();
  });

  it('complains once per field, not once per read', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setRuntimeConfig({ relayUrl: 'https://relay.staging.test' });

    getServiceConfig();
    getServiceConfig();
    getServiceConfig();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not complain about a well-formed value', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setRuntimeConfig({
      relayUrl: 'wss://relay.staging.test',
      signerUrl: 'https://signer.staging.test',
    });

    getServiceConfig();
    expect(spy).not.toHaveBeenCalled();
  });

  it('accepts plain ws for a local relay', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setRuntimeConfig({ relayUrl: 'ws://localhost:7777' });

    expect(getServiceConfig().relayUrl).toBe('ws://localhost:7777');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('useServiceConfig', () => {
  it('returns the same object on repeat calls', () => {
    setRuntimeConfig({ relayUrl: 'wss://relay.staging.test' });
    expect(useServiceConfig()).toBe(useServiceConfig());
  });

  it('reads the config once, so a later global change is not picked up', () => {
    setRuntimeConfig({ relayUrl: 'wss://relay.staging.test' });
    expect(useServiceConfig().relayUrl).toBe('wss://relay.staging.test');

    setRuntimeConfig({ relayUrl: 'wss://relay.other.test' });
    expect(useServiceConfig().relayUrl).toBe('wss://relay.staging.test');
  });

  it('picks up a new config after a reset', () => {
    setRuntimeConfig({ relayUrl: 'wss://relay.staging.test' });
    expect(useServiceConfig().relayUrl).toBe('wss://relay.staging.test');

    _resetServiceConfig();
    setRuntimeConfig({ relayUrl: 'wss://relay.other.test' });
    expect(useServiceConfig().relayUrl).toBe('wss://relay.other.test');
  });
});

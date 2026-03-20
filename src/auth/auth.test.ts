/**
 * @fileoverview Tests for Cloistr auth module
 */

import { describe, it, expect } from 'vitest';
import { detectExtension, isNip07Supported } from './nip07.js';
import { isNip46Supported, isValidBunkerUrl } from './nip46.js';
import { AuthError, Nip07Error, Nip46Error } from './types.js';

describe('NIP-07 Extension Detection', () => {
  it('should detect no extension in test environment', () => {
    const detection = detectExtension();
    expect(detection.available).toBe(false);
  });

  it('should report NIP-07 as not supported in test environment', () => {
    expect(isNip07Supported()).toBe(false);
  });
});

describe('NIP-46 Support', () => {
  it('should support NIP-46 in environments with crypto and WebSocket', () => {
    expect(isNip46Supported()).toBe(true);
  });

  it('should validate bunker URLs correctly', () => {
    // Valid bunker URL
    const validUrl = 'bunker://0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef?relay=wss://relay.example.com';
    expect(isValidBunkerUrl(validUrl)).toBe(true);

    // Invalid URLs
    expect(isValidBunkerUrl('not-a-url')).toBe(false);
    expect(isValidBunkerUrl('https://example.com')).toBe(false);
    expect(isValidBunkerUrl('bunker://short-pubkey')).toBe(false);
  });
});

describe('Error Classes', () => {
  it('should create AuthError with correct properties', () => {
    const error = new AuthError('Test error', 'nip07', 'TEST_CODE');
    expect(error.name).toBe('AuthError');
    expect(error.message).toBe('Test error');
    expect(error.method).toBe('nip07');
    expect(error.code).toBe('TEST_CODE');
  });

  it('should create Nip07Error with correct properties', () => {
    const error = new Nip07Error('Extension error', 'EXT_ERROR');
    expect(error.name).toBe('Nip07Error');
    expect(error.message).toBe('Extension error');
    expect(error.method).toBe('nip07');
    expect(error.code).toBe('EXT_ERROR');
  });

  it('should create Nip46Error with correct properties', () => {
    const error = new Nip46Error('Remote signer error', 'REMOTE_ERROR');
    expect(error.name).toBe('Nip46Error');
    expect(error.message).toBe('Remote signer error');
    expect(error.method).toBe('nip46');
    expect(error.code).toBe('REMOTE_ERROR');
  });
});
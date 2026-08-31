/**
 * Tests for client-side encryption utilities.
 *
 * These tests assert runtime behaviour — not TypeScript types.
 * The suite was added after a namespace-import bug (import * as sodium)
 * that made randombytes_buf and all crypto functions silently undefined;
 * typechecking and the build both passed, yet every call would have thrown
 * "TypeError: sodium.randombytes_buf is not a function" at runtime.
 *
 * The all-zeros check and the two-differ check are the most important
 * assertions here: a round-trip test alone can pass with a broken RNG that
 * always returns the same key/nonce.
 */

import { describe, it, expect } from 'vitest';
import { generateKey, encryptBlob, decryptBlob } from './encryption.js';

describe('generateKey', () => {
  it('returns a 32-byte Uint8Array', async () => {
    const key = await generateKey();
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  it('is not all zeros', async () => {
    const key = await generateKey();
    const allZero = key.every(b => b === 0);
    expect(allZero).toBe(false);
  });

  it('two successive keys differ from each other', async () => {
    const a = await generateKey();
    const b = await generateKey();
    // Compare byte-by-byte; two random 32-byte values matching is astronomically unlikely
    const identical = a.every((byte, i) => byte === b[i]);
    expect(identical).toBe(false);
  });
});

describe('encryptBlob / decryptBlob', () => {
  it('round-trips plaintext through encrypt then decrypt', async () => {
    const key = await generateKey();
    const plaintext = new TextEncoder().encode('hello cloistr');

    const encrypted = await encryptBlob(plaintext, key);
    const decrypted = await decryptBlob(encrypted, key);

    expect(decrypted).toEqual(plaintext);
  });

  it('encrypting the same plaintext twice produces different ciphertexts (nonce is random)', async () => {
    const key = await generateKey();
    const plaintext = new TextEncoder().encode('nonce must be random');

    const a = await encryptBlob(plaintext, key);
    const b = await encryptBlob(plaintext, key);

    // Different nonces must produce different ciphertexts
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.nonce).not.toBe(b.nonce);
  });

  it('decrypting with the wrong key throws an EncryptionError', async () => {
    const key = await generateKey();
    const wrongKey = await generateKey();
    const plaintext = new TextEncoder().encode('secret data');

    const encrypted = await encryptBlob(plaintext, key);

    await expect(decryptBlob(encrypted, wrongKey)).rejects.toThrow();
  });

  it('decrypting with the wrong key does not silently return plaintext', async () => {
    const key = await generateKey();
    const wrongKey = await generateKey();
    const plaintext = new TextEncoder().encode('should not leak');

    const encrypted = await encryptBlob(plaintext, key);

    let result: Uint8Array | undefined;
    try {
      result = await decryptBlob(encrypted, wrongKey);
    } catch {
      // expected — decryption must throw, not return garbage
      result = undefined;
    }

    // If it somehow returned without throwing, the result must not match the original plaintext
    if (result !== undefined) {
      expect(result).not.toEqual(plaintext);
    }
  });

  it('rejects a key that is not 32 bytes', async () => {
    const shortKey = new Uint8Array(16);
    const plaintext = new TextEncoder().encode('test');
    await expect(encryptBlob(plaintext, shortKey)).rejects.toThrow('32 bytes');
  });
});

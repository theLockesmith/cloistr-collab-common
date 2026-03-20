/**
 * Client-side encryption utilities using XChaCha20-Poly1305
 */

import * as sodium from 'libsodium-wrappers';
import { EncryptedBlob, EncryptionError } from './types.js';

// Ensure sodium is ready
let sodiumReady = false;

async function ensureSodiumReady(): Promise<void> {
  if (!sodiumReady) {
    await sodium.ready;
    sodiumReady = true;
  }
}

/**
 * Generate a random 256-bit encryption key
 */
export async function generateKey(): Promise<Uint8Array> {
  await ensureSodiumReady();
  return sodium.randombytes_buf(32); // 256 bits
}

/**
 * Encrypt data using XChaCha20-Poly1305
 */
export async function encryptBlob(data: Uint8Array, key: Uint8Array): Promise<EncryptedBlob> {
  try {
    await ensureSodiumReady();

    if (key.length !== 32) {
      throw new EncryptionError('Encryption key must be 32 bytes (256 bits)');
    }

    // Generate random nonce for XChaCha20-Poly1305
    const nonce = sodium.randombytes_buf(24); // XChaCha20-Poly1305 uses 24-byte nonce

    // Encrypt the data
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      data,
      null, // No additional data
      null, // No secret nonce
      nonce,
      key
    );

    return {
      ciphertext: sodium.to_base64(ciphertext),
      nonce: sodium.to_base64(nonce),
      algorithm: 'xchacha20-poly1305'
    };
  } catch (error) {
    if (error instanceof EncryptionError) {
      throw error;
    }
    throw new EncryptionError(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypt data using XChaCha20-Poly1305
 */
export async function decryptBlob(encrypted: EncryptedBlob, key: Uint8Array): Promise<Uint8Array> {
  try {
    await ensureSodiumReady();

    if (key.length !== 32) {
      throw new EncryptionError('Decryption key must be 32 bytes (256 bits)');
    }

    if (encrypted.algorithm !== 'xchacha20-poly1305') {
      throw new EncryptionError(`Unsupported encryption algorithm: ${encrypted.algorithm}`);
    }

    // Decode base64 data
    const ciphertext = sodium.from_base64(encrypted.ciphertext);
    const nonce = sodium.from_base64(encrypted.nonce);

    if (nonce.length !== 24) {
      throw new EncryptionError('Invalid nonce length for XChaCha20-Poly1305');
    }

    // Decrypt the data
    const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null, // No secret nonce
      ciphertext,
      null, // No additional data
      nonce,
      key
    );

    return plaintext;
  } catch (error) {
    if (error instanceof EncryptionError) {
      throw error;
    }
    // Handle libsodium decryption failures
    if (error instanceof Error && error.message.includes('ciphertext verification failed')) {
      throw new EncryptionError('Decryption failed: Invalid key or corrupted data');
    }
    throw new EncryptionError(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Convert a hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new EncryptionError('Invalid hex string length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
/**
 * @fileoverview NIP-07 browser extension signer implementation
 * Provides authentication via Nostr browser extensions (Alby, nos2x, etc.)
 */

import { Event, UnsignedEvent } from 'nostr-tools';
import { SignerInterface, ExtensionDetection, Nip07Error } from './types.js';

/**
 * Browser extension interface as defined by NIP-07
 */
interface NostrExtension {
  getPublicKey(): Promise<string>;
  signEvent(event: UnsignedEvent): Promise<Event>;
  getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>;
  nip04?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
}

declare global {
  interface Window {
    nostr?: NostrExtension;
  }
}

/**
 * Detect if a NIP-07 compatible extension is available
 * @returns Detection result with availability and extension info
 */
export function detectExtension(): ExtensionDetection {
  if (typeof window === 'undefined') {
    return { available: false };
  }

  if (!window.nostr) {
    return { available: false };
  }

  // Try to detect specific extensions by checking for unique properties
  let name: string | undefined;

  // Check for common extensions
  if ('getalby' in window) {
    name = 'Alby';
  } else if ('nos2x' in window) {
    name = 'nos2x';
  } else if (window.nostr && 'getPublicKey' in window.nostr) {
    name = 'Unknown NIP-07 Extension';
  }

  return {
    available: true,
    name,
  };
}

/**
 * NIP-07 signer implementation using browser extension
 */
class Nip07Signer implements SignerInterface {
  private extension: NostrExtension;
  private cachedPubkey: string | null = null;

  constructor(extension: NostrExtension) {
    this.extension = extension;
  }

  /**
   * Get the public key from the extension
   */
  async getPublicKey(): Promise<string> {
    if (this.cachedPubkey) {
      return this.cachedPubkey;
    }

    try {
      this.cachedPubkey = await this.extension.getPublicKey();
      return this.cachedPubkey;
    } catch (error) {
      throw new Nip07Error(
        `Failed to get public key: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_PUBKEY_FAILED'
      );
    }
  }

  /**
   * Sign an event using the extension
   */
  async signEvent(event: UnsignedEvent): Promise<Event> {
    try {
      return await this.extension.signEvent(event);
    } catch (error) {
      throw new Nip07Error(
        `Failed to sign event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SIGN_EVENT_FAILED'
      );
    }
  }

  /**
   * Encrypt a message using NIP-04
   */
  async encrypt(pubkey: string, plaintext: string): Promise<string> {
    if (!this.extension.nip04) {
      throw new Nip07Error(
        'Extension does not support NIP-04 encryption',
        'NIP04_NOT_SUPPORTED'
      );
    }

    try {
      return await this.extension.nip04.encrypt(pubkey, plaintext);
    } catch (error) {
      throw new Nip07Error(
        `Failed to encrypt message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ENCRYPT_FAILED'
      );
    }
  }

  /**
   * Decrypt a message using NIP-04
   */
  async decrypt(pubkey: string, ciphertext: string): Promise<string> {
    if (!this.extension.nip04) {
      throw new Nip07Error(
        'Extension does not support NIP-04 decryption',
        'NIP04_NOT_SUPPORTED'
      );
    }

    try {
      return await this.extension.nip04.decrypt(pubkey, ciphertext);
    } catch (error) {
      throw new Nip07Error(
        `Failed to decrypt message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DECRYPT_FAILED'
      );
    }
  }

  /**
   * Disconnect (no-op for NIP-07)
   */
  async disconnect(): Promise<void> {
    this.cachedPubkey = null;
  }
}

/**
 * Connect to a NIP-07 browser extension
 * @returns Promise resolving to signer interface
 * @throws Nip07Error if extension is not available or connection fails
 */
export async function connectNip07(): Promise<SignerInterface> {
  const detection = detectExtension();

  if (!detection.available) {
    throw new Nip07Error(
      'No NIP-07 compatible browser extension found. Please install a Nostr extension like Alby or nos2x.',
      'EXTENSION_NOT_FOUND'
    );
  }

  const extension = window.nostr!;
  const signer = new Nip07Signer(extension);

  // Test the connection by getting the public key
  try {
    await signer.getPublicKey();
  } catch (error) {
    if (error instanceof Nip07Error) {
      throw error;
    }
    throw new Nip07Error(
      `Failed to connect to extension: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'CONNECTION_FAILED'
    );
  }

  return signer;
}

/**
 * Check if NIP-07 is supported in the current environment
 */
export function isNip07Supported(): boolean {
  return typeof window !== 'undefined' && detectExtension().available;
}
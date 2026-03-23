/**
 * Blossom client for blob storage with NIP-98 authentication
 */

import { BlobMetadata, BlossomError, StorageSignerInterface, StorageConfig } from './types.js';
import { bytesToHex } from './encryption.js';

/**
 * Calculate SHA-256 hash of data
 */
async function sha256(data: Uint8Array): Promise<string> {
  // Ensure we have a proper ArrayBuffer for crypto.subtle
  const buffer = data.buffer instanceof ArrayBuffer ?
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) :
    new ArrayBuffer(data.byteLength);

  if (!(data.buffer instanceof ArrayBuffer)) {
    new Uint8Array(buffer).set(data);
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return bytesToHex(new Uint8Array(hashBuffer));
}

/**
 * Blossom blob storage client
 */
export class BlobStore {
  private config: StorageConfig;

  constructor(config: StorageConfig) {
    this.config = config;
  }

  /**
   * Upload a blob to the Blossom server
   */
  async upload(
    data: Uint8Array,
    mimeType: string,
    signer: StorageSignerInterface
  ): Promise<BlobMetadata> {
    try {
      // Calculate SHA-256 hash of the content
      const hash = await sha256(data);

      // Create Blossom auth event
      const authHeader = await this.createAuthHeader('upload', hash, signer);

      // Upload the blob
      const response = await fetch(`${this.config.blossomUrl}/upload`, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeType,
          'Authorization': authHeader,
        },
        body: data.buffer instanceof ArrayBuffer ?
          data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) :
          new Uint8Array(data),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new BlossomError(
          `Upload failed: ${response.status} ${response.statusText} - ${errorText}`,
          response.status
        );
      }

      const result = await response.json();

      return {
        hash,
        size: data.length,
        mimeType,
        createdAt: Date.now(),
        url: result.url || `${this.config.blossomUrl}/${hash}`,
      };
    } catch (error) {
      if (error instanceof BlossomError) {
        throw error;
      }
      throw new BlossomError(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Download a blob from the Blossom server
   */
  async download(hash: string): Promise<Uint8Array> {
    try {
      const response = await fetch(`${this.config.blossomUrl}/${hash}`, {
        method: 'GET',
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new BlossomError(`Blob not found: ${hash}`, 404);
        }
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new BlossomError(
          `Download failed: ${response.status} ${response.statusText} - ${errorText}`,
          response.status
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      // Verify hash matches
      const actualHash = await sha256(data);
      if (actualHash !== hash) {
        throw new BlossomError(`Hash mismatch: expected ${hash}, got ${actualHash}`);
      }

      return data;
    } catch (error) {
      if (error instanceof BlossomError) {
        throw error;
      }
      throw new BlossomError(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a blob from the Blossom server
   */
  async delete(hash: string, signer: StorageSignerInterface): Promise<void> {
    try {
      // Create Blossom auth event
      const authHeader = await this.createAuthHeader('delete', hash, signer);

      const response = await fetch(`${this.config.blossomUrl}/${hash}`, {
        method: 'DELETE',
        headers: {
          'Authorization': authHeader,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          // Already deleted, consider it success
          return;
        }
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new BlossomError(
          `Delete failed: ${response.status} ${response.statusText} - ${errorText}`,
          response.status
        );
      }
    } catch (error) {
      if (error instanceof BlossomError) {
        throw error;
      }
      throw new BlossomError(`Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create Blossom authorization header (BUD-02)
   * Uses kind 24242 with t, expiration, and x tags
   */
  private async createAuthHeader(
    action: string,
    blobHash: string,
    signer: StorageSignerInterface
  ): Promise<string> {
    try {
      const pubkey = await signer.getPublicKey();
      const now = Math.floor(Date.now() / 1000);
      const expiration = now + 300; // 5 minutes from now

      // Create Blossom auth event (BUD-02)
      const authEvent = {
        kind: 24242, // Blossom auth kind
        content: `${action} ${blobHash}`,
        created_at: now,
        tags: [
          ['t', action], // Action: "upload", "delete", etc.
          ['x', blobHash], // Blob hash
          ['expiration', expiration.toString()], // Expiration timestamp
        ],
        pubkey,
      };

      // Sign the event (returns id and sig)
      const { id, sig } = await signer.signEvent(authEvent);

      // Create the authorization header with complete event
      const eventJson = JSON.stringify({
        id,
        ...authEvent,
        sig,
      });

      return `Nostr ${btoa(eventJson)}`;
    } catch (error) {
      throw new BlossomError(`Auth header creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a blob exists on the server
   */
  async exists(hash: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.blossomUrl}/${hash}`, {
        method: 'HEAD',
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get blob metadata without downloading content
   */
  async getMetadata(hash: string): Promise<BlobMetadata | null> {
    try {
      const response = await fetch(`${this.config.blossomUrl}/${hash}`, {
        method: 'HEAD',
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new BlossomError(`Metadata request failed: ${response.status}`, response.status);
      }

      const contentLength = response.headers.get('content-length');
      const contentType = response.headers.get('content-type');
      const lastModified = response.headers.get('last-modified');

      return {
        hash,
        size: contentLength ? parseInt(contentLength, 10) : 0,
        mimeType: contentType || 'application/octet-stream',
        createdAt: lastModified ? new Date(lastModified).getTime() : Date.now(),
        url: `${this.config.blossomUrl}/${hash}`,
      };
    } catch (error) {
      if (error instanceof BlossomError) {
        throw error;
      }
      throw new BlossomError(`Metadata request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
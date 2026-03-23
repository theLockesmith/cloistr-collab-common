/**
 * Document persistence via Blossom storage and Nostr events
 *
 * Saves Y.Doc snapshots to Blossom and tracks them via kind 30078 events.
 */

import * as Y from 'yjs';
import { Relay, Event, UnsignedEvent, Filter } from 'nostr-tools';
import { BlobStore } from '../storage/blossom.js';
import type { StorageSignerInterface } from '../storage/types.js';
import {
  PersistenceConfig,
  SnapshotMetadata,
  SaveResult,
  LoadResult,
  PersistenceError,
  SnapshotNotFoundError,
  BlobDownloadError,
} from './types.js';

const SNAPSHOT_KIND = 30078; // NIP-78 application-specific data
const APP_VERSION = '1.0.0';
const MIME_TYPE = 'application/x-yjs-update';

/**
 * Handles document persistence via Blossom storage
 */
export class DocumentPersistence {
  private doc: Y.Doc;
  private config: PersistenceConfig;
  private blobStore: BlobStore;
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private lastSaveHash: string | null = null;
  private isDirty = false;
  private pubkey: string | null = null;

  /** Called after successful save */
  public onSave?: (result: SaveResult) => void;
  /** Called after successful load */
  public onLoad?: (result: LoadResult) => void;
  /** Called on error */
  public onError?: (error: Error) => void;

  constructor(doc: Y.Doc, config: PersistenceConfig) {
    this.doc = doc;
    this.config = config;
    this.blobStore = new BlobStore({ blossomUrl: config.blossomUrl });

    // Track document changes
    this.doc.on('update', this.handleUpdate.bind(this));

    // Start auto-save if configured
    if (config.autoSaveInterval && config.autoSaveInterval > 0) {
      this.startAutoSave(config.autoSaveInterval);
    }
  }

  /**
   * Initialize persistence (get pubkey from signer)
   */
  async init(): Promise<void> {
    this.pubkey = await this.config.signer.getPublicKey();
    console.log(`[Persistence] Initialized for document: ${this.config.documentId}`);
  }

  /**
   * Save the current document state to Blossom
   */
  async save(): Promise<SaveResult> {
    if (!this.pubkey) {
      await this.init();
    }

    try {
      console.log(`[Persistence] Saving document: ${this.config.documentId}`);

      // Serialize the document state
      const stateUpdate = Y.encodeStateAsUpdate(this.doc);
      console.log(`[Persistence] Serialized ${stateUpdate.byteLength} bytes`);

      // Upload to Blossom
      const storageSigner = this.createStorageSigner();
      const metadata = await this.blobStore.upload(stateUpdate, MIME_TYPE, storageSigner);
      console.log(`[Persistence] Uploaded to Blossom: ${metadata.hash}`);

      // Publish Nostr event with snapshot reference
      const eventId = await this.publishSnapshotEvent(metadata.hash, stateUpdate.byteLength);
      console.log(`[Persistence] Published snapshot event: ${eventId}`);

      this.lastSaveHash = metadata.hash;
      this.isDirty = false;

      const result: SaveResult = {
        hash: metadata.hash,
        eventId,
        size: stateUpdate.byteLength,
        timestamp: Date.now(),
      };

      this.onSave?.(result);
      return result;

    } catch (error) {
      const err = new PersistenceError(
        `Failed to save document: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
      this.onError?.(err);
      throw err;
    }
  }

  /**
   * Load the latest document state from Blossom
   */
  async load(): Promise<LoadResult> {
    if (!this.pubkey) {
      await this.init();
    }

    try {
      console.log(`[Persistence] Loading document: ${this.config.documentId}`);

      // Query for latest snapshot event
      const snapshotEvent = await this.fetchLatestSnapshotEvent();

      if (!snapshotEvent) {
        console.log(`[Persistence] No snapshot found for: ${this.config.documentId}`);
        return { found: false };
      }

      // Parse snapshot metadata
      const metadata: SnapshotMetadata = JSON.parse(snapshotEvent.content);
      console.log(`[Persistence] Found snapshot: ${metadata.hash} (${metadata.size} bytes)`);

      // Download blob from Blossom
      let stateUpdate: Uint8Array;
      try {
        stateUpdate = await this.blobStore.download(metadata.hash);
      } catch (error) {
        throw new BlobDownloadError(metadata.hash, error instanceof Error ? error : undefined);
      }

      console.log(`[Persistence] Downloaded ${stateUpdate.byteLength} bytes`);

      // Apply the state to the document
      Y.applyUpdate(this.doc, stateUpdate, 'persistence');
      console.log(`[Persistence] Applied state update`);

      this.lastSaveHash = metadata.hash;
      this.isDirty = false;

      const result: LoadResult = {
        found: true,
        metadata,
        lastUpdated: snapshotEvent.created_at * 1000,
        eventId: snapshotEvent.id,
      };

      this.onLoad?.(result);
      return result;

    } catch (error) {
      if (error instanceof SnapshotNotFoundError || error instanceof BlobDownloadError) {
        this.onError?.(error);
        throw error;
      }
      const err = new PersistenceError(
        `Failed to load document: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
      this.onError?.(err);
      throw err;
    }
  }

  /**
   * Check if a snapshot exists for this document
   */
  async exists(): Promise<boolean> {
    if (!this.pubkey) {
      await this.init();
    }

    const event = await this.fetchLatestSnapshotEvent();
    return event !== null;
  }

  /**
   * Get the last saved blob hash
   */
  getLastSaveHash(): string | null {
    return this.lastSaveHash;
  }

  /**
   * Check if document has unsaved changes
   */
  hasUnsavedChanges(): boolean {
    return this.isDirty;
  }

  /**
   * Start auto-save with given interval
   */
  startAutoSave(intervalMs: number): void {
    this.stopAutoSave();

    console.log(`[Persistence] Auto-save enabled: ${intervalMs}ms interval`);

    this.autoSaveTimer = setInterval(async () => {
      if (this.isDirty) {
        try {
          await this.save();
        } catch (error) {
          console.error('[Persistence] Auto-save failed:', error);
        }
      }
    }, intervalMs);
  }

  /**
   * Stop auto-save
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopAutoSave();
    this.doc.off('update', this.handleUpdate);
  }

  /**
   * Handle document updates (mark as dirty)
   */
  private handleUpdate(_update: Uint8Array, origin: any): void {
    // Don't mark dirty for updates from persistence loading
    if (origin !== 'persistence') {
      this.isDirty = true;
    }
  }

  /**
   * Publish a snapshot reference event to Nostr
   */
  private async publishSnapshotEvent(hash: string, size: number): Promise<string> {
    const relay = await Relay.connect(this.config.relayUrl);

    try {
      const metadata: SnapshotMetadata = {
        hash,
        size,
        mimeType: MIME_TYPE,
        timestamp: Date.now(),
        encrypted: false,
        appVersion: APP_VERSION,
      };

      const unsignedEvent: UnsignedEvent = {
        kind: SNAPSHOT_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['d', this.config.documentId],
          ['t', 'yjs-snapshot'],
          ['client', 'cloistr-collab'],
        ],
        content: JSON.stringify(metadata),
        pubkey: this.pubkey!,
      };

      const signedEvent = await this.config.signer.signEvent(unsignedEvent);
      await relay.publish(signedEvent);

      return signedEvent.id;

    } finally {
      await relay.close();
    }
  }

  /**
   * Fetch the latest snapshot event for this document
   */
  private async fetchLatestSnapshotEvent(): Promise<Event | null> {
    const relay = await Relay.connect(this.config.relayUrl);

    try {
      const filter: Filter = {
        kinds: [SNAPSHOT_KIND],
        authors: [this.pubkey!],
        '#d': [this.config.documentId],
        limit: 1,
      };

      return new Promise<Event | null>((resolve) => {
        let found: Event | null = null;

        const sub = relay.subscribe([filter], {
          onevent: (event: Event) => {
            // Keep the most recent event
            if (!found || event.created_at > found.created_at) {
              found = event;
            }
          },
          oneose: () => {
            sub.close();
            resolve(found);
          },
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          sub.close();
          resolve(found);
        }, 10000);
      });

    } finally {
      await relay.close();
    }
  }

  /**
   * Create a storage signer adapter from SignerInterface
   */
  private createStorageSigner(): StorageSignerInterface {
    return {
      getPublicKey: () => this.config.signer.getPublicKey(),
      signEvent: async (event: { kind: number; content: string; created_at: number; tags: string[][]; pubkey: string }) => {
        const unsigned: UnsignedEvent = {
          kind: event.kind,
          content: event.content,
          created_at: event.created_at,
          tags: event.tags,
          pubkey: event.pubkey,
        };
        const signed = await this.config.signer.signEvent(unsigned);
        return signed.sig;
      },
    };
  }
}

/**
 * Factory function to create document persistence
 */
export function createDocumentPersistence(
  doc: Y.Doc,
  config: PersistenceConfig
): DocumentPersistence {
  return new DocumentPersistence(doc, config);
}

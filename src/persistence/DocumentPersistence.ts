/**
 * Document persistence via Blossom storage and Nostr events
 *
 * Saves Y.Doc snapshots to Blossom and tracks them via kind 30078 events.
 */

import * as Y from 'yjs';
import { Relay, Event, UnsignedEvent, Filter, type VerifiedEvent } from 'nostr-tools';
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
  LoadTimeoutError,
  RelayRejectionError,
  UploadTimeoutError,
  DocumentType,
} from './types.js';
import { isAuthRequired, isRateLimited, getRelayRejectionReason } from './relay-errors.js';
import { nextCreatedAt } from '../relay/created-at.js';
import { boundedPublish, boundedAuth } from '../relay/bounded-publish.js';

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
  private _loadCompleted = false;

  /** Document title (user-editable) */
  private _title: string;
  /** Document type */
  private _documentType: DocumentType;
  /** Original creation timestamp */
  private _createdAt: number;

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

    // Initialize metadata from config or derive from documentId
    this._title = config.title || config.documentId;
    this._documentType = config.documentType || this.inferDocumentType(config.documentId);
    this._createdAt = config.createdAt || Date.now();

    // Track document changes
    this.doc.on('update', this.handleUpdate.bind(this));
  }

  /**
   * Infer document type from documentId prefix
   */
  private inferDocumentType(documentId: string): DocumentType {
    if (documentId.startsWith('sheet-')) return 'sheet';
    if (documentId.startsWith('whiteboard-')) return 'whiteboard';
    if (documentId.startsWith('slides-')) return 'slides';
    return 'doc';
  }

  /**
   * Get document title
   */
  get title(): string {
    return this._title;
  }

  /**
   * Set document title
   */
  set title(value: string) {
    if (value !== this._title) {
      this._title = value;
      this.isDirty = true;
    }
  }

  /**
   * Get document type
   */
  get documentType(): DocumentType {
    return this._documentType;
  }

  /**
   * Get creation timestamp
   */
  get createdAt(): number {
    return this._createdAt;
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
    if (!this._loadCompleted) {
      throw new PersistenceError('Cannot save: document load has not completed');
    }
    if (!this.pubkey) {
      await this.init();
    }

    try {
      console.log(`[Persistence] Saving document: ${this.config.documentId}`);

      // Serialize the document state
      const stateUpdate = Y.encodeStateAsUpdate(this.doc);
      console.log(`[Persistence] Serialized ${stateUpdate.byteLength} bytes`);

      // Upload to Blossom (bounded to prevent infinite hang)
      const UPLOAD_TIMEOUT_MS = 60_000;
      const storageSigner = this.createStorageSigner();
      let uploadTimer: ReturnType<typeof setTimeout>;
      const metadata = await Promise.race([
        this.blobStore.upload(stateUpdate, MIME_TYPE, storageSigner),
        new Promise<never>((_, reject) => {
          uploadTimer = setTimeout(
            () => reject(new UploadTimeoutError(UPLOAD_TIMEOUT_MS)),
            UPLOAD_TIMEOUT_MS,
          );
        }),
      ]).finally(() => clearTimeout(uploadTimer!));
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
      if (
        error instanceof RelayRejectionError ||
        error instanceof UploadTimeoutError
      ) {
        this.onError?.(error);
        throw error;
      }
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
        this._loadCompleted = true;
        this.startDeferredAutoSave();
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

      // Restore metadata from loaded snapshot
      if (metadata.title) {
        this._title = metadata.title;
      }
      if (metadata.type) {
        this._documentType = metadata.type;
      }
      if (metadata.createdAt) {
        this._createdAt = metadata.createdAt;
      }

      const result: LoadResult = {
        found: true,
        metadata,
        lastUpdated: snapshotEvent.created_at * 1000,
        eventId: snapshotEvent.id,
      };

      this._loadCompleted = true;
      this.startDeferredAutoSave();
      this.onLoad?.(result);
      return result;

    } catch (error) {
      if (
        error instanceof SnapshotNotFoundError ||
        error instanceof BlobDownloadError ||
        error instanceof LoadTimeoutError
      ) {
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

  private startDeferredAutoSave(): void {
    if (this.config.autoSaveInterval && this.config.autoSaveInterval > 0) {
      this.startAutoSave(this.config.autoSaveInterval);
    }
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
   * Publish a snapshot reference event to Nostr.
   *
   * Cloistr's relay gates publishes behind NIP-42 authentication. `relay.publish`
   * throws `auth-required: …` when the relay has not yet authenticated this
   * connection. The fix: catch the rejection, authenticate once, and retry.
   *
   * signEvent is NIP-46 (remote signer) — if the signer is unreachable, the
   * relay.auth() callback will stall. A 10-second timeout ensures `relay.close()`
   * in the finally block is not blocked indefinitely.
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
        title: this._title,
        type: this._documentType,
        createdAt: this._createdAt,
      };

      const addressKey = `${SNAPSHOT_KIND}:${this.pubkey}:${this.config.documentId}`;

      const unsignedEvent: UnsignedEvent = {
        kind: SNAPSHOT_KIND,
        created_at: nextCreatedAt(addressKey),
        tags: [
          ['d', this.config.documentId],
          ['t', 'yjs-snapshot'],
          ['t', this._documentType], // Tag by document type for filtering
          ['client', 'cloistr-collab'],
        ],
        content: JSON.stringify(metadata),
        pubkey: this.pubkey!,
      };

      const signedEvent = await this.config.signer.signEvent(unsignedEvent);

      const MAX_RETRIES = 3;
      let authed = false;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          await boundedPublish(relay, signedEvent);
          return signedEvent.id;
        } catch (error) {
          if (isAuthRequired(error) && !authed) {
            const pubkey = this.pubkey!;
            const signer = this.config.signer;
            await boundedAuth(relay, async (authEvent) => {
              const signed = await signer.signEvent({ ...authEvent, pubkey });
              return signed as VerifiedEvent;
            });
            authed = true;
            continue;
          }
          if (isRateLimited(error) && attempt < MAX_RETRIES) {
            const delay = 1000 * Math.pow(2, attempt);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          const reason = getRelayRejectionReason(error);
          if (reason) throw new RelayRejectionError(reason);
          throw error;
        }
      }
      throw new RelayRejectionError('rate-limited: retries exhausted');

    } finally {
      await relay.close();
    }
  }

  /**
   * Fetch the latest snapshot event for this document.
   *
   * IMPORTANT: use `await new Promise(...)` rather than `return new Promise(...)`.
   *
   * With `return new Promise(...)`, the try block exits as soon as `return` is
   * evaluated — which is immediately, before the Promise settles. The `finally`
   * block then fires right away and calls `relay.close()`, which calls
   * `closeAllSubscriptions()` synchronously. By the time EOSE arrives (a
   * macrotask), `relay.openSubs.get(subId)` returns undefined and the EOSE
   * handler is silently dropped. The inner resolve() fires only from the
   * 10-second timeout, with `found` still null: every reload starts blank.
   *
   * With `await new Promise(...)`, the async function suspends here. EOSE
   * arrives, `oneose` fires, the Promise resolves, then `finally` runs and
   * closes the relay cleanly.
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

      // await (not return) so the finally block runs AFTER the Promise settles.
      const result = await new Promise<Event | null>((resolve, reject) => {
        let found: Event | null = null;

        let done = false;
        const finish = (answered: boolean) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          try { sub.close(); } catch { /* closed socket */ }
          if (found) {
            resolve(found);
          } else if (answered) {
            resolve(null);
          } else {
            reject(new LoadTimeoutError(this.config.documentId, this.config.relayUrl));
          }
        };

        const sub = relay.subscribe([filter], {
          onevent: (event: Event) => {
            if (!found || event.created_at > found.created_at) {
              found = event;
            }
          },
          oneose: () => finish(true),
          onclose: () => finish(false),
          eoseTimeout: 100000,
        });

        const timer = setTimeout(() => finish(false), 10000);
      });

      return result;

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
        return { id: signed.id, sig: signed.sig };
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

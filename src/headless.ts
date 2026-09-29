/**
 * Headless Yjs collaboration client.
 *
 * Joins a collab room, reads and writes the document, saves to Blossom, and
 * leaves. No React, no browser APIs. Signs through a pluggable signer
 * (use @cloistr/auth/core's connectNip46).
 *
 * ```ts
 * import { HeadlessCollabClient } from '@cloistr/collab-common/core';
 * import { connectNip46 } from '@cloistr/auth/core';
 *
 * const signer = await connectNip46(bunkerUrl, relayUrl);
 * const client = new HeadlessCollabClient({
 *   signer,
 *   relayUrl: 'wss://relay.cloistr.xyz',
 *   blossomUrl: 'https://nostr.download',
 * });
 *
 * await client.join('doc-123-abc', 'doc');
 * client.getText().insert(0, 'Hello from headless!');
 * await client.save();
 * await client.leave();
 * ```
 */

import * as Y from 'yjs';
import type { SignerInterface } from '@cloistr/auth/core';
import { createCollabDoc, getSharedType, serializeDoc } from './crdt/document.js';
import { createNostrSyncProvider, NostrSyncProvider } from './crdt/provider.js';
import { DocumentPersistence, createDocumentPersistence } from './persistence/DocumentPersistence.js';
import type { DocType, DocTypeMap, NostrSyncConfig } from './crdt/types.js';
import type { SaveResult, LoadResult } from './persistence/types.js';

export interface HeadlessCollabConfig {
  signer: SignerInterface;
  relayUrl: string;
  blossomUrl: string;
  /** Timeout for initial sync in ms (default: 10000) */
  syncTimeout?: number;
  /** NIP-13 proof of work difficulty (default: 0) */
  powDifficulty?: number;
}

export class HeadlessCollabClient {
  private config: HeadlessCollabConfig;
  private doc: Y.Doc | null = null;
  private _docId: string | null = null;
  private _docType: DocType | null = null;
  private provider: NostrSyncProvider | null = null;
  private persistence: DocumentPersistence | null = null;

  constructor(config: HeadlessCollabConfig) {
    this.config = config;
  }

  /**
   * Join a collab room: create the Yjs doc, load the latest snapshot from
   * Blossom, and connect the Nostr sync provider for real-time updates.
   */
  async join(docId: string, docType: DocType): Promise<LoadResult> {
    if (this.doc) {
      throw new Error('Already joined a document. Call leave() first.');
    }

    this._docId = docId;
    this._docType = docType;
    this.doc = createCollabDoc(docId, docType);

    this.persistence = createDocumentPersistence(this.doc, {
      documentId: docId,
      blossomUrl: this.config.blossomUrl,
      relayUrl: this.config.relayUrl,
      signer: this.config.signer,
    });

    let loadResult: LoadResult;
    try {
      loadResult = await this.persistence.load();
    } catch {
      loadResult = { found: false };
    }

    const syncConfig: NostrSyncConfig = {
      signer: this.config.signer,
      relayUrl: this.config.relayUrl,
      docId,
      powDifficulty: this.config.powDifficulty,
    };

    this.provider = createNostrSyncProvider(this.doc, syncConfig);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve();
      }, this.config.syncTimeout ?? 10000);

      this.provider!.onConnect = () => {
        clearTimeout(timeout);
        resolve();
      };

      this.provider!.onError = (err) => {
        clearTimeout(timeout);
        reject(err);
      };

      this.provider!.connect().catch(reject);
    });

    return loadResult;
  }

  get currentDocId(): string | null {
    return this._docId;
  }

  getDoc(): Y.Doc {
    if (!this.doc) throw new Error('Not joined. Call join() first.');
    return this.doc;
  }

  getSharedType<T extends DocType>(docType?: T): DocTypeMap[T] {
    if (!this.doc || !this._docType) throw new Error('Not joined. Call join() first.');
    return getSharedType(this.doc, (docType ?? this._docType) as T);
  }

  getText(): Y.Text {
    return this.getSharedType('doc') as Y.Text;
  }

  getMap(): Y.Map<any> {
    if (!this._docType) throw new Error('Not joined. Call join() first.');
    return this.getSharedType(this._docType) as Y.Map<any>;
  }

  getArray(): Y.Array<any> {
    return this.getSharedType('slide') as Y.Array<any>;
  }

  serialize(): Uint8Array {
    if (!this.doc) throw new Error('Not joined. Call join() first.');
    return serializeDoc(this.doc);
  }

  async save(): Promise<SaveResult> {
    if (!this.persistence) throw new Error('Not joined. Call join() first.');
    return this.persistence.save();
  }

  get connected(): boolean {
    return this.provider?.connected ?? false;
  }

  get peerCount(): number {
    return this.provider?.peerCount ?? 0;
  }

  async leave(): Promise<void> {
    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
    }

    if (this.persistence) {
      this.persistence.destroy();
      this.persistence = null;
    }

    if (this.doc) {
      this.doc.destroy();
      this.doc = null;
    }

    this._docId = null;
    this._docType = null;
  }
}

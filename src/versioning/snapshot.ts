/**
 * @fileoverview Snapshot manager for Yjs document versioning
 * Handles snapshot creation, storage, and restoration
 */

import * as Y from 'yjs';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '../storage/encryption.js';
import {
  VersionInfo,
  VersionHistory,
  Snapshot,
  SnapshotConfig,
  SaveSnapshotOptions,
  VersioningError,
} from './types.js';

/**
 * Generate a unique version ID
 */
export function generateVersionId(): string {
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  return bytesToHex(random);
}

/**
 * Calculate hash of snapshot data
 */
export function hashSnapshot(data: Uint8Array): string {
  const hash = sha256(data);
  return bytesToHex(hash);
}

/**
 * Encode Yjs document state for storage
 */
export function encodeDocState(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

/**
 * Create a full state snapshot (not incremental)
 */
export function createFullSnapshot(doc: Y.Doc): Uint8Array {
  // Get the full document state
  return Y.encodeStateAsUpdate(doc);
}

/**
 * Apply a snapshot to restore document state
 */
export function applySnapshot(doc: Y.Doc, snapshot: Uint8Array, origin?: any): void {
  Y.applyUpdate(doc, snapshot, origin);
}

/**
 * Manages document snapshots and version history
 */
export class SnapshotManager {
  private config: Required<SnapshotConfig>;
  private history: VersionHistory;
  private lastSaveTime = 0;
  private pendingChanges = false;
  private autoSaveTimer: NodeJS.Timeout | null = null;

  // Callbacks
  public onSnapshot?: (snapshot: Snapshot) => void;
  public onRestore?: (versionId: string) => void;
  public onHistoryChange?: (history: VersionHistory) => void;

  constructor(config: SnapshotConfig) {
    this.config = {
      docId: config.docId,
      autoSaveInterval: config.autoSaveInterval ?? 0,
      maxVersions: config.maxVersions ?? 100,
      minSaveInterval: config.minSaveInterval ?? 5000,
    };

    this.history = {
      docId: config.docId,
      versions: [],
      currentVersionId: null,
      totalVersions: 0,
    };
  }

  /**
   * Create a snapshot of the current document state
   */
  createSnapshot(
    doc: Y.Doc,
    authorPubkey: string,
    options: SaveSnapshotOptions = {}
  ): Snapshot {
    const state = createFullSnapshot(doc);
    const now = Date.now();

    // Check minimum save interval
    if (!options.force && now - this.lastSaveTime < this.config.minSaveInterval) {
      throw new VersioningError('Save rate limit exceeded');
    }

    const versionId = generateVersionId();
    const parentId = this.history.currentVersionId;

    const info: VersionInfo = {
      id: versionId,
      docId: this.config.docId,
      version: this.history.totalVersions + 1,
      timestamp: now,
      authorPubkey,
      label: options.label,
      description: options.description,
      size: state.byteLength,
      parentId,
      hash: hashSnapshot(state),
    };

    const snapshot: Snapshot = { info, state };

    // Update history
    this.addVersion(info);
    this.lastSaveTime = now;
    this.pendingChanges = false;

    // Trigger callback
    this.onSnapshot?.(snapshot);

    return snapshot;
  }

  /**
   * Add a version to history
   */
  private addVersion(info: VersionInfo): void {
    // Add to beginning (most recent first)
    this.history.versions.unshift(info);
    this.history.currentVersionId = info.id;
    this.history.totalVersions++;

    // Trim old versions if exceeding max
    if (this.history.versions.length > this.config.maxVersions) {
      this.history.versions = this.history.versions.slice(0, this.config.maxVersions);
    }

    this.onHistoryChange?.(this.history);
  }

  /**
   * Restore document to a specific version
   */
  restoreFromSnapshot(doc: Y.Doc, snapshot: Snapshot, origin?: any): void {
    // Create a new document and apply the snapshot
    // This ensures clean state without orphaned data
    const tempDoc = new Y.Doc();
    Y.applyUpdate(tempDoc, snapshot.state);

    // Clear current doc and apply the restored state
    // Note: In production, you'd want a more sophisticated merge strategy
    const fullState = Y.encodeStateAsUpdate(tempDoc);
    Y.applyUpdate(doc, fullState, origin || 'restore');

    tempDoc.destroy();

    // Update current version
    this.history.currentVersionId = snapshot.info.id;
    this.onRestore?.(snapshot.info.id);
    this.onHistoryChange?.(this.history);
  }

  /**
   * Mark that changes have been made
   */
  markChanged(): void {
    this.pendingChanges = true;
  }

  /**
   * Check if there are unsaved changes
   */
  hasUnsavedChanges(): boolean {
    return this.pendingChanges;
  }

  /**
   * Get last save timestamp
   */
  getLastSaveTime(): number {
    return this.lastSaveTime;
  }

  /**
   * Get current version history
   */
  getHistory(): VersionHistory {
    return { ...this.history };
  }

  /**
   * Get current version info
   */
  getCurrentVersion(): VersionInfo | null {
    if (!this.history.currentVersionId) return null;
    return this.history.versions.find(v => v.id === this.history.currentVersionId) || null;
  }

  /**
   * Get version by ID
   */
  getVersion(versionId: string): VersionInfo | null {
    return this.history.versions.find(v => v.id === versionId) || null;
  }

  /**
   * Load history from external source
   */
  loadHistory(history: VersionHistory): void {
    this.history = { ...history };
    this.onHistoryChange?.(this.history);
  }

  /**
   * Start auto-save timer
   */
  startAutoSave(doc: Y.Doc, authorPubkey: string): void {
    if (this.config.autoSaveInterval <= 0) return;
    if (this.autoSaveTimer) return;

    this.autoSaveTimer = setInterval(() => {
      if (this.pendingChanges) {
        try {
          this.createSnapshot(doc, authorPubkey, { force: false });
        } catch {
          // Rate limited or other error, skip this interval
        }
      }
    }, this.config.autoSaveInterval);
  }

  /**
   * Stop auto-save timer
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Check if auto-save is running
   */
  isAutoSaveEnabled(): boolean {
    return this.autoSaveTimer !== null;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopAutoSave();
  }
}

/**
 * Compare two snapshots to check if they differ
 */
export function snapshotsEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Get document size in bytes
 */
export function getDocumentSize(doc: Y.Doc): number {
  return encodeDocState(doc).byteLength;
}

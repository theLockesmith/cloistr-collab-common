import * as Y from 'yjs';
import { SignerInterface } from '../auth/types.js';

/**
 * Supported document types for collaboration
 */
export type DocType = 'doc' | 'sheet' | 'slide' | 'whiteboard';

/**
 * State of a collaborative document
 */
export interface CollabDocState {
  /** The Yjs document instance */
  ydoc: Y.Doc | null;
  /** Unique document identifier */
  docId: string;
  /** Type of document */
  docType: DocType;
  /** Whether the document has been loaded/initialized */
  isLoaded: boolean;
  /** Whether the document is currently synced with remote */
  isSynced: boolean;
  /** Number of connected peers */
  peerCount: number;
  /** Last sync timestamp */
  lastSyncAt: Date | null;
  /** Any sync error message */
  syncError: string | null;
}

/**
 * Interface for sync providers
 */
export interface SyncProvider {
  /** Connect to the sync provider */
  connect(): Promise<void>;

  /** Disconnect from the sync provider */
  disconnect(): Promise<void>;

  /** Whether the provider is currently connected */
  readonly connected: boolean;

  /** Number of connected peers */
  readonly peerCount: number;

  /** Send a Yjs update through this provider */
  sendUpdate(update: Uint8Array): Promise<void>;

  /** Event handlers */
  onUpdate?: (update: Uint8Array, origin: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onPeersChange?: (peerCount: number) => void;
  onError?: (error: Error) => void;

  /** Clean up resources */
  destroy(): void;
}

/**
 * Configuration for Nostr sync provider
 */
export interface NostrSyncConfig {
  /** Signer for signing Nostr events */
  signer: SignerInterface;
  /** Relay URL to connect to */
  relayUrl: string;
  /** Document ID to sync */
  docId: string;
  /** Optional pubkey for filtering events (room-based sync) */
  roomPubkey?: string;
  /** Timeout for relay connections in ms */
  connectionTimeout?: number;
  /** Whether to persist updates to IndexedDB */
  persist?: boolean;
  /** NIP-13 proof of work difficulty (number of leading zero bits required) */
  powDifficulty?: number;
}

/**
 * Yjs shared types mapped to document types
 */
export interface DocTypeMap {
  doc: Y.Text;
  sheet: Y.Map<any>;
  slide: Y.Array<any>;
  whiteboard: Y.Map<any>;
}

/**
 * Configuration for creating a collaborative document
 */
export interface CollabDocConfig {
  /** Document ID */
  docId: string;
  /** Document type */
  docType: DocType;
  /** Sync provider configuration */
  syncConfig?: NostrSyncConfig;
  /** Whether to enable persistence */
  persist?: boolean;
  /** Initial document state */
  initialState?: Uint8Array;
}

/**
 * Events emitted by the collab doc system
 */
export interface CollabDocEvents {
  loaded: (docId: string) => void;
  synced: (docId: string) => void;
  disconnected: (docId: string) => void;
  error: (docId: string, error: Error) => void;
  peersChanged: (docId: string, peerCount: number) => void;
  updated: (docId: string, update: Uint8Array) => void;
}

/**
 * Update message format for Nostr relay sync
 */
export interface NostrUpdateMessage {
  /** Document ID */
  docId: string;
  /** Yjs update data (base64 encoded) */
  update: string;
  /** Timestamp */
  timestamp: number;
  /** Sender pubkey */
  sender: string;
  /** Optional room/channel identifier */
  room?: string;
}
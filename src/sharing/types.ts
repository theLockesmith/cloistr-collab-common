/**
 * @fileoverview Type definitions for sharing module
 * Provides document sharing and permission management
 */

/**
 * Permission levels for document access
 */
export type PermissionLevel = 'none' | 'view' | 'comment' | 'edit' | 'admin';

/**
 * Permission comparison for checking access
 */
export const PERMISSION_HIERARCHY: Record<PermissionLevel, number> = {
  none: 0,
  view: 1,
  comment: 2,
  edit: 3,
  admin: 4,
};

/**
 * Share recipient type
 */
export type RecipientType = 'pubkey' | 'link';

/**
 * Individual share entry
 */
export interface ShareEntry {
  /** Unique share ID */
  id: string;
  /** Recipient type */
  type: RecipientType;
  /** Recipient pubkey (for pubkey shares) */
  recipientPubkey?: string;
  /** Permission level */
  permission: PermissionLevel;
  /** Encrypted session key (NIP-44 wrapped for recipient) */
  encryptedKey?: string;
  /** Created timestamp */
  createdAt: number;
  /** Optional expiration timestamp */
  expiresAt?: number;
  /** Optional view limit */
  maxViews?: number;
  /** Current view count (for link shares) */
  viewCount?: number;
  /** Share creator pubkey */
  creatorPubkey: string;
  /** Optional label/name for the share */
  label?: string;
}

/**
 * Document sharing metadata stored in Nostr event (kind 30078)
 */
export interface ShareMetadata {
  /** Document ID */
  docId: string;
  /** Document type */
  docType: string;
  /** Owner pubkey */
  ownerPubkey: string;
  /** List of share entries */
  shares: ShareEntry[];
  /** Default permission for authenticated users (optional) */
  defaultPermission?: PermissionLevel;
  /** Created timestamp */
  createdAt: number;
  /** Last modified timestamp */
  updatedAt: number;
}

/**
 * Share link structure
 */
export interface ShareLink {
  /** Full shareable URL */
  url: string;
  /** Base URL (without fragment) */
  baseUrl: string;
  /** Share ID embedded in URL */
  shareId: string;
  /** Session key (in URL fragment, never sent to server) */
  key: string;
  /** Permission level */
  permission: PermissionLevel;
  /** Expiration date (if set) */
  expiresAt?: number;
}

/**
 * Parsed share link from URL
 */
export interface ParsedShareLink {
  /** Share ID */
  shareId: string;
  /** Session key (from fragment) */
  key: string;
  /** Document ID (if present in URL) */
  docId?: string;
}

/**
 * Configuration for creating a share
 */
export interface CreateShareConfig {
  /** Document ID */
  docId: string;
  /** Permission level to grant */
  permission: PermissionLevel;
  /** Recipient pubkey (for direct shares) */
  recipientPubkey?: string;
  /** Session key for the document (will be encrypted for recipient) */
  sessionKey: Uint8Array;
  /** Expiration timestamp */
  expiresAt?: number;
  /** Maximum views (for link shares) */
  maxViews?: number;
  /** Optional label */
  label?: string;
}

/**
 * Result of share creation
 */
export interface CreateShareResult {
  /** Share entry created */
  share: ShareEntry;
  /** Share link (for link shares) */
  link?: ShareLink;
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  /** Whether access is allowed */
  allowed: boolean;
  /** Permission level granted */
  permission: PermissionLevel;
  /** Source of permission (owner, share, default) */
  source: 'owner' | 'share' | 'default' | 'none';
  /** Share entry that granted access (if applicable) */
  shareEntry?: ShareEntry;
  /** Reason if denied */
  deniedReason?: string;
}

/**
 * Sharing context state
 */
export interface SharingState {
  /** Document ID */
  docId: string | null;
  /** Current user's permission */
  permission: PermissionLevel;
  /** Whether user is the owner */
  isOwner: boolean;
  /** Share metadata (if owner/admin) */
  shareMetadata: ShareMetadata | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
}

/**
 * Sharing context value
 */
export interface SharingContextValue {
  /** Current state */
  state: SharingState;
  /** Check if current user has at least the given permission */
  hasPermission(required: PermissionLevel): boolean;
  /** Create a new share */
  createShare(config: CreateShareConfig): Promise<CreateShareResult>;
  /** Revoke a share by ID */
  revokeShare(shareId: string): Promise<void>;
  /** Update share permissions */
  updateShare(shareId: string, updates: Partial<ShareEntry>): Promise<void>;
  /** Get all shares for the document */
  getShares(): ShareEntry[];
  /** Generate a public share link */
  generateLink(config: Omit<CreateShareConfig, 'recipientPubkey'>): Promise<ShareLink>;
  /** Parse a share link URL */
  parseLink(url: string): ParsedShareLink | null;
}

/**
 * Error class for sharing operations
 */
export class SharingError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'SharingError';
  }
}

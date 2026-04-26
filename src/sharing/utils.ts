/**
 * @fileoverview Sharing utilities for key sharing and link generation
 * Implements NIP-44 based key encryption and URL-fragment-based public links
 */

import { bytesToHex, hexToBytes } from '../storage/encryption.js';
import {
  PermissionLevel,
  PERMISSION_HIERARCHY,
  ShareEntry,
  ShareLink,
  ParsedShareLink,
  CreateShareConfig,
  CreateShareResult,
  PermissionCheckResult,
  ShareMetadata,
} from './types.js';
import type { SignerInterface } from '../auth/types.js';

/**
 * Generate a unique share ID
 */
export function generateShareId(): string {
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  return bytesToHex(random);
}

/**
 * Check if one permission level satisfies another
 */
export function hasPermission(
  granted: PermissionLevel,
  required: PermissionLevel
): boolean {
  return PERMISSION_HIERARCHY[granted] >= PERMISSION_HIERARCHY[required];
}

/**
 * Check if a share entry is still valid (not expired, not over view limit)
 */
export function isShareValid(share: ShareEntry): boolean {
  // Check expiration
  if (share.expiresAt && Date.now() > share.expiresAt) {
    return false;
  }

  // Check view limit
  if (share.maxViews !== undefined && share.viewCount !== undefined) {
    if (share.viewCount >= share.maxViews) {
      return false;
    }
  }

  return true;
}

/**
 * Encrypt a session key for a specific recipient using NIP-44
 * Note: This is a simplified implementation. Full NIP-44 requires
 * the signer to perform the encryption with the recipient's pubkey.
 */
export async function encryptKeyForRecipient(
  sessionKey: Uint8Array,
  recipientPubkey: string,
  signer: SignerInterface
): Promise<string> {
  // Use NIP-04/NIP-44 encryption via the signer
  const keyHex = bytesToHex(sessionKey);
  const encrypted = await signer.encrypt(recipientPubkey, keyHex);
  return encrypted;
}

/**
 * Decrypt a session key that was encrypted for us
 */
export async function decryptKeyFromSender(
  encryptedKey: string,
  senderPubkey: string,
  signer: SignerInterface
): Promise<Uint8Array> {
  const decrypted = await signer.decrypt(senderPubkey, encryptedKey);
  return hexToBytes(decrypted);
}

/**
 * Generate a public share link with key in URL fragment
 * Format: {baseUrl}?share={shareId}#key={base64url-encoded-key}
 */
export function generateShareLink(
  baseUrl: string,
  shareId: string,
  sessionKey: Uint8Array,
  permission: PermissionLevel,
  expiresAt?: number
): ShareLink {
  // Encode key as base64url (safe for URL fragments)
  const keyBase64 = base64UrlEncode(sessionKey);

  // Build URL
  const url = new URL(baseUrl);
  url.searchParams.set('share', shareId);

  // Key goes in fragment (never sent to server)
  const fullUrl = `${url.toString()}#key=${keyBase64}`;

  return {
    url: fullUrl,
    baseUrl: url.toString(),
    shareId,
    key: keyBase64,
    permission,
    expiresAt,
  };
}

/**
 * Parse a share link URL to extract share ID and key
 */
export function parseShareLink(url: string): ParsedShareLink | null {
  try {
    const parsed = new URL(url);
    const shareId = parsed.searchParams.get('share');
    const docId = parsed.searchParams.get('docId');

    if (!shareId) {
      return null;
    }

    // Parse fragment for key
    const fragment = parsed.hash.slice(1); // Remove leading #
    const fragmentParams = new URLSearchParams(fragment);
    const key = fragmentParams.get('key');

    if (!key) {
      return null;
    }

    return {
      shareId,
      key,
      docId: docId || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Decode a key from a share link
 */
export function decodeShareLinkKey(keyBase64: string): Uint8Array {
  return base64UrlDecode(keyBase64);
}

/**
 * Check user's permission for a document
 */
export function checkPermission(
  userPubkey: string,
  metadata: ShareMetadata
): PermissionCheckResult {
  // Owner has full access
  if (userPubkey === metadata.ownerPubkey) {
    return {
      allowed: true,
      permission: 'admin',
      source: 'owner',
    };
  }

  // Check direct shares to this user
  for (const share of metadata.shares) {
    if (share.type === 'pubkey' && share.recipientPubkey === userPubkey) {
      if (!isShareValid(share)) {
        continue; // Skip expired/exhausted shares
      }
      return {
        allowed: true,
        permission: share.permission,
        source: 'share',
        shareEntry: share,
      };
    }
  }

  // Check default permission
  if (metadata.defaultPermission && metadata.defaultPermission !== 'none') {
    return {
      allowed: true,
      permission: metadata.defaultPermission,
      source: 'default',
    };
  }

  // No access
  return {
    allowed: false,
    permission: 'none',
    source: 'none',
    deniedReason: 'No share found for this user',
  };
}

/**
 * Check permission using a share link
 */
export function checkLinkPermission(
  shareId: string,
  metadata: ShareMetadata
): PermissionCheckResult {
  const share = metadata.shares.find(s => s.id === shareId && s.type === 'link');

  if (!share) {
    return {
      allowed: false,
      permission: 'none',
      source: 'none',
      deniedReason: 'Share link not found',
    };
  }

  if (!isShareValid(share)) {
    return {
      allowed: false,
      permission: 'none',
      source: 'none',
      deniedReason: share.expiresAt && Date.now() > share.expiresAt
        ? 'Share link has expired'
        : 'Share link view limit reached',
    };
  }

  return {
    allowed: true,
    permission: share.permission,
    source: 'share',
    shareEntry: share,
  };
}

/**
 * Create a new share entry
 */
export async function createShare(
  config: CreateShareConfig,
  creatorPubkey: string,
  signer: SignerInterface
): Promise<CreateShareResult> {
  const shareId = generateShareId();
  const now = Date.now();

  const share: ShareEntry = {
    id: shareId,
    type: config.recipientPubkey ? 'pubkey' : 'link',
    recipientPubkey: config.recipientPubkey,
    permission: config.permission,
    createdAt: now,
    expiresAt: config.expiresAt,
    maxViews: config.maxViews,
    viewCount: 0,
    creatorPubkey,
    label: config.label,
  };

  // For pubkey shares, encrypt the session key for the recipient
  if (config.recipientPubkey) {
    share.encryptedKey = await encryptKeyForRecipient(
      config.sessionKey,
      config.recipientPubkey,
      signer
    );
  }

  // For link shares, generate the share link
  let link: ShareLink | undefined;
  if (!config.recipientPubkey) {
    const baseUrl = typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : 'https://docs.cloistr.xyz';

    link = generateShareLink(
      baseUrl,
      shareId,
      config.sessionKey,
      config.permission,
      config.expiresAt
    );
  }

  return { share, link };
}

/**
 * Increment view count for a share (for link shares with view limits)
 */
export function incrementViewCount(share: ShareEntry): ShareEntry {
  return {
    ...share,
    viewCount: (share.viewCount || 0) + 1,
  };
}

/**
 * Create empty share metadata for a new document
 */
export function createEmptyShareMetadata(
  docId: string,
  docType: string,
  ownerPubkey: string
): ShareMetadata {
  const now = Date.now();
  return {
    docId,
    docType,
    ownerPubkey,
    shares: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================================
// Base64URL encoding/decoding (URL-safe, no padding)
// ============================================================

function base64UrlEncode(data: Uint8Array): string {
  // Convert to regular base64
  let base64 = '';
  const bytes = new Uint8Array(data);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    base64 += String.fromCharCode(bytes[i]);
  }
  base64 = btoa(base64);

  // Make URL-safe: replace + with -, / with _, remove =
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlDecode(str: string): Uint8Array {
  // Restore standard base64
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }

  // Decode
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

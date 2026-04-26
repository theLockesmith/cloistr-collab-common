/**
 * @fileoverview Sharing module - Document sharing and permissions
 * Provides NIP-44 based key sharing, public share links, and permission management
 */

// Export types
export type {
  PermissionLevel,
  RecipientType,
  ShareEntry,
  ShareMetadata,
  ShareLink,
  ParsedShareLink,
  CreateShareConfig,
  CreateShareResult,
  PermissionCheckResult,
  SharingState,
  SharingContextValue,
} from './types.js';

export { PERMISSION_HIERARCHY, SharingError } from './types.js';

// Export utilities
export {
  generateShareId,
  hasPermission,
  isShareValid,
  encryptKeyForRecipient,
  decryptKeyFromSender,
  generateShareLink,
  parseShareLink,
  decodeShareLinkKey,
  checkPermission,
  checkLinkPermission,
  createShare,
  incrementViewCount,
  createEmptyShareMetadata,
} from './utils.js';

// Export hooks
export {
  useSharing,
  usePermission,
  useShareLink,
  useShareLinkTracking,
} from './hooks.js';

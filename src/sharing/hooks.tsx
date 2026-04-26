/**
 * @fileoverview React hooks for document sharing and permissions
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PermissionLevel,
  ShareEntry,
  ShareMetadata,
  SharingState,
  CreateShareConfig,
  CreateShareResult,
  ShareLink,
  ParsedShareLink,
  SharingError,
} from './types.js';
import {
  hasPermission as checkHasPermission,
  checkPermission,
  checkLinkPermission,
  createShare as createShareUtil,
  parseShareLink,
  decodeShareLinkKey,
  createEmptyShareMetadata,
  incrementViewCount,
} from './utils.js';
import type { SignerInterface } from '../auth/types.js';

/**
 * Hook for managing document sharing and permissions
 */
export function useSharing(
  docId: string | null,
  docType: string,
  userPubkey: string | null,
  signer: SignerInterface | null,
  options?: {
    /** Initial share metadata (from persistence) */
    initialMetadata?: ShareMetadata | null;
    /** Callback when metadata changes */
    onMetadataChange?: (metadata: ShareMetadata) => void;
    /** Share link from URL (for link-based access) */
    shareLink?: ParsedShareLink | null;
  }
): {
  state: SharingState;
  hasPermission: (required: PermissionLevel) => boolean;
  createShare: (config: Omit<CreateShareConfig, 'docId'>) => Promise<CreateShareResult>;
  revokeShare: (shareId: string) => void;
  updateShare: (shareId: string, updates: Partial<ShareEntry>) => void;
  getShares: () => ShareEntry[];
  generateLink: (config: Omit<CreateShareConfig, 'docId' | 'recipientPubkey'>) => Promise<ShareLink>;
  setMetadata: (metadata: ShareMetadata) => void;
  getSessionKeyFromLink: () => Uint8Array | null;
} {
  const [metadata, setMetadata] = useState<ShareMetadata | null>(
    options?.initialMetadata || null
  );
  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);

  // Determine current user's permission
  const permissionResult = useMemo(() => {
    if (!metadata || !userPubkey) {
      // Check if we have link-based access
      if (options?.shareLink && metadata) {
        return checkLinkPermission(options.shareLink.shareId, metadata);
      }
      return { allowed: false, permission: 'none' as PermissionLevel, source: 'none' as const };
    }

    return checkPermission(userPubkey, metadata);
  }, [metadata, userPubkey, options?.shareLink]);

  // Build state
  const state: SharingState = useMemo(() => ({
    docId,
    permission: permissionResult.permission,
    isOwner: metadata?.ownerPubkey === userPubkey,
    shareMetadata: permissionResult.permission === 'admin' ? metadata : null,
    isLoading,
    error,
  }), [docId, permissionResult, metadata, userPubkey, isLoading, error]);

  // Check if user has required permission
  const hasPermission = useCallback((required: PermissionLevel): boolean => {
    return checkHasPermission(permissionResult.permission, required);
  }, [permissionResult.permission]);

  // Create a new share
  const createShare = useCallback(async (
    config: Omit<CreateShareConfig, 'docId'>
  ): Promise<CreateShareResult> => {
    if (!docId) {
      throw new SharingError('No document ID');
    }
    if (!userPubkey) {
      throw new SharingError('Not authenticated');
    }
    if (!signer) {
      throw new SharingError('No signer available');
    }
    if (!hasPermission('admin')) {
      throw new SharingError('Admin permission required to share');
    }

    const result = await createShareUtil(
      { ...config, docId },
      userPubkey,
      signer
    );

    // Update metadata
    setMetadata(prev => {
      const updated = prev || createEmptyShareMetadata(docId, docType, userPubkey);
      const newMetadata = {
        ...updated,
        shares: [...updated.shares, result.share],
        updatedAt: Date.now(),
      };
      options?.onMetadataChange?.(newMetadata);
      return newMetadata;
    });

    return result;
  }, [docId, docType, userPubkey, signer, hasPermission, options?.onMetadataChange]);

  // Revoke a share
  const revokeShare = useCallback((shareId: string): void => {
    if (!hasPermission('admin')) {
      throw new SharingError('Admin permission required to revoke shares');
    }

    setMetadata(prev => {
      if (!prev) return prev;
      const newMetadata = {
        ...prev,
        shares: prev.shares.filter(s => s.id !== shareId),
        updatedAt: Date.now(),
      };
      options?.onMetadataChange?.(newMetadata);
      return newMetadata;
    });
  }, [hasPermission, options?.onMetadataChange]);

  // Update a share
  const updateShare = useCallback((
    shareId: string,
    updates: Partial<ShareEntry>
  ): void => {
    if (!hasPermission('admin')) {
      throw new SharingError('Admin permission required to update shares');
    }

    setMetadata(prev => {
      if (!prev) return prev;
      const newMetadata = {
        ...prev,
        shares: prev.shares.map(s =>
          s.id === shareId ? { ...s, ...updates } : s
        ),
        updatedAt: Date.now(),
      };
      options?.onMetadataChange?.(newMetadata);
      return newMetadata;
    });
  }, [hasPermission, options?.onMetadataChange]);

  // Get all shares
  const getShares = useCallback((): ShareEntry[] => {
    return metadata?.shares || [];
  }, [metadata]);

  // Generate a public share link
  const generateLink = useCallback(async (
    config: Omit<CreateShareConfig, 'docId' | 'recipientPubkey'>
  ): Promise<ShareLink> => {
    const result = await createShare(config);
    if (!result.link) {
      throw new SharingError('Failed to generate share link');
    }
    return result.link;
  }, [createShare]);

  // Get session key from link (for link-based access)
  const getSessionKeyFromLink = useCallback((): Uint8Array | null => {
    if (!options?.shareLink?.key) {
      return null;
    }
    try {
      return decodeShareLinkKey(options.shareLink.key);
    } catch {
      return null;
    }
  }, [options?.shareLink]);

  return {
    state,
    hasPermission,
    createShare,
    revokeShare,
    updateShare,
    getShares,
    generateLink,
    setMetadata,
    getSessionKeyFromLink,
  };
}

/**
 * Hook for checking permissions (simplified, read-only)
 */
export function usePermission(
  permission: PermissionLevel,
  required: PermissionLevel
): boolean {
  return useMemo(
    () => checkHasPermission(permission, required),
    [permission, required]
  );
}

/**
 * Hook for parsing share link from current URL
 */
export function useShareLink(): ParsedShareLink | null {
  const [link, setLink] = useState<ParsedShareLink | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const parsed = parseShareLink(window.location.href);
    setLink(parsed);

    // Listen for hash changes
    const handleHashChange = () => {
      const newParsed = parseShareLink(window.location.href);
      setLink(newParsed);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return link;
}

/**
 * Hook for managing share link view counting
 */
export function useShareLinkTracking(
  shareId: string | null,
  metadata: ShareMetadata | null,
  onUpdate?: (metadata: ShareMetadata) => void
): {
  trackView: () => void;
  viewCount: number;
  maxViews: number | undefined;
  isLimitReached: boolean;
} {
  const share = useMemo(() => {
    if (!shareId || !metadata) return null;
    return metadata.shares.find(s => s.id === shareId);
  }, [shareId, metadata]);

  const trackView = useCallback(() => {
    if (!share || !metadata) return;
    if (share.type !== 'link') return;

    const updatedShare = incrementViewCount(share);
    const newMetadata = {
      ...metadata,
      shares: metadata.shares.map(s =>
        s.id === shareId ? updatedShare : s
      ),
      updatedAt: Date.now(),
    };
    onUpdate?.(newMetadata);
  }, [share, metadata, shareId, onUpdate]);

  return {
    trackView,
    viewCount: share?.viewCount || 0,
    maxViews: share?.maxViews,
    isLimitReached: share?.maxViews !== undefined &&
      (share?.viewCount || 0) >= share.maxViews,
  };
}

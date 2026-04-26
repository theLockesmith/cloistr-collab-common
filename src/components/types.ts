/**
 * @fileoverview Type definitions for shared UI components
 */

import type { PermissionLevel, ShareEntry, ShareLink } from '../sharing/types.js';
import type { VersionInfo, UndoState } from '../versioning/types.js';

/**
 * Common component props
 */
export interface BaseComponentProps {
  /** Additional CSS classes */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
}

/**
 * Toolbar props
 */
export interface ToolbarProps extends BaseComponentProps {
  /** Document title (editable if onTitleChange provided) */
  title?: string;
  /** Callback when title is changed */
  onTitleChange?: (title: string) => void;
  /** Current undo state */
  undoState?: UndoState;
  /** Undo callback */
  onUndo?: () => void;
  /** Redo callback */
  onRedo?: () => void;
  /** Save callback */
  onSave?: () => void;
  /** Whether save is in progress */
  isSaving?: boolean;
  /** Whether there are unsaved changes */
  hasUnsavedChanges?: boolean;
  /** Last saved timestamp */
  lastSavedAt?: number | null;
  /** Share callback */
  onShare?: () => void;
  /** Current user's permission level */
  permission?: PermissionLevel;
  /** Connection status */
  isConnected?: boolean;
  /** Number of connected peers */
  peerCount?: number;
  /** Custom actions to render */
  customActions?: React.ReactNode;
  /** Compact mode (minimal UI) */
  compact?: boolean;
}

/**
 * Share dialog props
 */
export interface ShareDialogProps extends BaseComponentProps {
  /** Whether dialog is open */
  isOpen: boolean;
  /** Close callback */
  onClose: () => void;
  /** Document ID */
  docId: string;
  /** Document title */
  docTitle?: string;
  /** Current shares */
  shares: ShareEntry[];
  /** User's permission level */
  permission: PermissionLevel;
  /** Create a new pubkey share */
  onCreateShare: (recipientPubkey: string, permission: PermissionLevel) => Promise<void>;
  /** Create a link share */
  onCreateLink: (permission: PermissionLevel, expiresAt?: number, maxViews?: number) => Promise<ShareLink>;
  /** Revoke a share */
  onRevokeShare: (shareId: string) => void;
  /** Update share permissions */
  onUpdateShare?: (shareId: string, permission: PermissionLevel) => void;
}

/**
 * Version history panel props
 */
export interface VersionHistoryProps extends BaseComponentProps {
  /** List of versions */
  versions: VersionInfo[];
  /** Currently active version ID */
  currentVersionId: string | null;
  /** Restore callback */
  onRestore: (versionId: string) => void;
  /** Whether restore is in progress */
  isRestoring?: boolean;
  /** Show version labels */
  showLabels?: boolean;
  /** Show author info */
  showAuthor?: boolean;
}

/**
 * Connection status indicator props
 */
export interface ConnectionStatusProps extends BaseComponentProps {
  /** Whether connected to relay */
  isConnected: boolean;
  /** Number of connected relays */
  relayCount?: number;
  /** Number of connected peers */
  peerCount?: number;
  /** Show detailed status on hover */
  showDetails?: boolean;
  /** Click callback */
  onClick?: () => void;
}

/**
 * Save status indicator props
 */
export interface SaveStatusProps extends BaseComponentProps {
  /** Whether currently saving */
  isSaving: boolean;
  /** Whether there are unsaved changes */
  hasUnsavedChanges: boolean;
  /** Last saved timestamp */
  lastSavedAt: number | null;
  /** Auto-save enabled */
  autoSaveEnabled?: boolean;
  /** Save callback */
  onSave?: () => void;
}

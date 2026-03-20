/**
 * Type definitions for presence awareness system
 * Based on Yjs awareness protocol with Nostr pubkey integration
 */

export interface CursorPosition {
  /** X coordinate for spatial cursor (e.g. canvas, whiteboard) */
  x?: number;
  /** Y coordinate for spatial cursor */
  y?: number;
  /** Text position for text editors (character offset) */
  index?: number;
  /** Length of text selection */
  length?: number;
}

export interface UserPresence {
  /** Yjs awareness client ID */
  clientId: number;
  /** Nostr public key (hex format) */
  pubkey: string;
  /** Display name */
  name: string;
  /** User's assigned color (hex format) */
  color: string;
  /** Current cursor position */
  cursor?: CursorPosition;
  /** Current selection range */
  selection?: {
    anchor: CursorPosition;
    head: CursorPosition;
  };
  /** Last activity timestamp */
  lastSeen: number;
}

export interface PresenceState {
  /** Local user's presence state */
  localUser: UserPresence | null;
  /** Array of remote users currently online */
  remoteUsers: UserPresence[];
  /** Total number of connected users (including local) */
  userCount: number;
}

export interface PresenceUpdate {
  /** Type of presence update */
  type: 'cursor' | 'selection' | 'name' | 'join' | 'leave';
  /** Updated cursor position */
  cursor?: CursorPosition;
  /** Updated selection */
  selection?: {
    anchor: CursorPosition;
    head: CursorPosition;
  };
  /** Updated display name */
  name?: string;
}

/**
 * Configuration for presence awareness
 */
export interface PresenceConfig {
  /** Local user's pubkey */
  pubkey: string;
  /** Local user's display name */
  name: string;
  /** Custom color for local user (optional, will be generated if not provided) */
  color?: string;
  /** Timeout for considering users offline (ms, default: 30000) */
  timeoutMs?: number;
}

/**
 * Presence event handlers
 */
export interface PresenceCallbacks {
  /** Called when remote user joins */
  onUserJoin?: (user: UserPresence) => void;
  /** Called when remote user leaves */
  onUserLeave?: (user: UserPresence) => void;
  /** Called when remote user updates cursor */
  onCursorUpdate?: (user: UserPresence, cursor: CursorPosition) => void;
  /** Called when remote user updates selection */
  onSelectionUpdate?: (user: UserPresence, selection: UserPresence['selection']) => void;
  /** Called when any presence state changes */
  onPresenceChange?: (state: PresenceState) => void;
}
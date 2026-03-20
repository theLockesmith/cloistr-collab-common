/**
 * Yjs awareness wrapper for presence management
 * Provides Nostr-aware presence handling with deterministic colors
 */

import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import type { UserPresence, CursorPosition, PresenceConfig, PresenceCallbacks } from './types.js';

/**
 * Create and configure awareness instance
 */
export function createAwareness(doc: Y.Doc): Awareness {
  const awareness = new Awareness(doc);

  // Set up cleanup on beforeunload
  if (typeof window !== 'undefined') {
    const cleanup = () => {
      awareness.setLocalState(null);
    };

    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('unload', cleanup);

    // Store cleanup function for manual cleanup
    (awareness as any)._cleanup = cleanup;
  }

  return awareness;
}

/**
 * Generate deterministic color from pubkey
 * Uses HSL to ensure good contrast and visual distinction
 */
export function generateUserColor(pubkey: string): string {
  // Use first 8 characters of pubkey as seed
  const seed = pubkey.slice(0, 8);
  let hash = 0;

  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) & 0xffffffff;
  }

  // Convert to positive number and normalize to 0-360 for hue
  const hue = Math.abs(hash) % 360;

  // Use fixed saturation and lightness for consistent appearance
  const saturation = 65 + (Math.abs(hash >> 8) % 25); // 65-90%
  const lightness = 45 + (Math.abs(hash >> 16) % 20); // 45-65%

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Set local user state in awareness
 */
export function setLocalState(
  awareness: Awareness,
  state: Partial<UserPresence>
): void {
  const currentState = awareness.getLocalState() as UserPresence | null;
  const newState: UserPresence = {
    ...currentState,
    ...state,
    clientId: awareness.clientID,
    lastSeen: Date.now(),
  } as UserPresence;

  awareness.setLocalState(newState);
}

/**
 * Get all remote user states from awareness
 */
export function getRemoteStates(awareness: Awareness): UserPresence[] {
  const states: UserPresence[] = [];
  const now = Date.now();
  const timeoutMs = 30000; // 30 seconds

  awareness.getStates().forEach((state, clientId) => {
    // Skip local state and invalid states
    if (
      clientId === awareness.clientID ||
      !state ||
      !state.pubkey ||
      now - state.lastSeen > timeoutMs
    ) {
      return;
    }

    states.push(state as UserPresence);
  });

  return states;
}

/**
 * Update cursor position for local user
 */
export function updateCursor(
  awareness: Awareness,
  cursor: CursorPosition | null
): void {
  setLocalState(awareness, { cursor: cursor || undefined });
}

/**
 * Update selection for local user
 */
export function updateSelection(
  awareness: Awareness,
  selection: UserPresence['selection']
): void {
  setLocalState(awareness, { selection });
}

/**
 * Initialize local user presence
 */
export function initializeLocalUser(
  awareness: Awareness,
  config: PresenceConfig
): UserPresence {
  const color = config.color || generateUserColor(config.pubkey);

  const localUser: UserPresence = {
    clientId: awareness.clientID,
    pubkey: config.pubkey,
    name: config.name,
    color,
    lastSeen: Date.now(),
  };

  awareness.setLocalState(localUser);
  return localUser;
}

/**
 * Set up awareness event listeners
 */
export function setupAwarenessListeners(
  awareness: Awareness,
  callbacks: PresenceCallbacks
): () => void {
  const handleChange = (
    changes: {
      added: number[];
      updated: number[];
      removed: number[];
    }
  ) => {
    const { added, updated, removed } = changes;

    // Handle removed users
    removed.forEach(clientId => {
      if (callbacks.onUserLeave) {
        // We don't have the user data anymore, so create minimal user object
        const user: UserPresence = {
          clientId,
          pubkey: '',
          name: '',
          color: '',
          lastSeen: 0,
        };
        callbacks.onUserLeave(user);
      }
    });

    // Handle added users
    added.forEach(clientId => {
      if (clientId === awareness.clientID) return;

      const state = awareness.getStates().get(clientId) as UserPresence;
      if (state && callbacks.onUserJoin) {
        callbacks.onUserJoin(state);
      }
    });

    // Handle updated users
    updated.forEach(clientId => {
      if (clientId === awareness.clientID) return;

      const state = awareness.getStates().get(clientId) as UserPresence;
      if (!state) return;

      if (callbacks.onCursorUpdate && state.cursor) {
        callbacks.onCursorUpdate(state, state.cursor);
      }

      if (callbacks.onSelectionUpdate && state.selection) {
        callbacks.onSelectionUpdate(state, state.selection);
      }
    });

    // Call general presence change callback
    if (callbacks.onPresenceChange) {
      const remoteUsers = getRemoteStates(awareness);
      const localState = awareness.getLocalState() as UserPresence | null;

      callbacks.onPresenceChange({
        localUser: localState,
        remoteUsers,
        userCount: remoteUsers.length + (localState ? 1 : 0),
      });
    }
  };

  awareness.on('change', handleChange);

  // Return cleanup function
  return () => {
    awareness.off('change', handleChange);

    // Clean up local state
    awareness.setLocalState(null);

    // Call manual cleanup if available
    if ((awareness as any)._cleanup) {
      (awareness as any)._cleanup();
    }
  };
}

/**
 * Clean up awareness instance
 */
export function destroyAwareness(awareness: Awareness): void {
  awareness.setLocalState(null);
  awareness.destroy();

  // Call manual cleanup if available
  if ((awareness as any)._cleanup) {
    (awareness as any)._cleanup();
  }
}
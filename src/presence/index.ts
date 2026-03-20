/**
 * Presence module for cloistr-collab-common
 * Provides real-time user presence awareness using Yjs awareness protocol
 */

// Export types
export type {
  UserPresence,
  CursorPosition,
  PresenceState,
  PresenceUpdate,
  PresenceConfig,
  PresenceCallbacks,
} from './types.js';

// Export awareness utilities
export {
  createAwareness,
  generateUserColor,
  setLocalState,
  getRemoteStates,
  updateCursor,
  updateSelection,
  initializeLocalUser,
  setupAwarenessListeners,
  destroyAwareness,
} from './awareness.js';

// Export React hooks
export {
  usePresence,
  useRemoteUsers,
  useLocalUser,
  useUserPresence,
} from './hooks.js';

// Export React components
export {
  UserAvatars,
  RemoteCursor,
  PresenceIndicator,
  UserSelection,
  CollaboratorList,
} from './components.js';

// Export component prop types for external customization
export type {
  UserAvatarsProps,
  RemoteCursorProps,
  PresenceIndicatorProps,
  UserSelectionProps,
  CollaboratorListProps,
} from './components.js';
/**
 * React hooks for presence awareness
 * Provides reactive state management for user presence
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Awareness } from 'y-protocols/awareness';
import type {
  PresenceState,
  UserPresence,
  CursorPosition,
  PresenceConfig,
  PresenceCallbacks,
} from './types.js';
import {
  getRemoteStates,
  updateCursor,
  updateSelection,
  initializeLocalUser,
  setupAwarenessListeners,
} from './awareness.js';

/**
 * Primary hook for managing presence state
 */
export function usePresence(
  awareness: Awareness | null,
  config: PresenceConfig,
  callbacks?: PresenceCallbacks
): {
  state: PresenceState;
  updateCursor: (cursor: CursorPosition | null) => void;
  updateSelection: (selection: UserPresence['selection']) => void;
  updateName: (name: string) => void;
  isReady: boolean;
} {
  const [state, setState] = useState<PresenceState>({
    localUser: null,
    remoteUsers: [],
    userCount: 0,
  });
  const [isReady, setIsReady] = useState(false);

  // Initialize local user when awareness is available
  useEffect(() => {
    if (!awareness) {
      setIsReady(false);
      return;
    }

    try {
      const localUser = initializeLocalUser(awareness, config);
      setState((prev: PresenceState) => ({
        ...prev,
        localUser,
        userCount: prev.remoteUsers.length + 1,
      }));
      setIsReady(true);
    } catch (error) {
      console.error('Failed to initialize local user:', error);
      setIsReady(false);
    }
  }, [awareness, config.pubkey, config.name, config.color]);

  // Set up awareness listeners
  useEffect(() => {
    if (!awareness || !isReady) return;

    const handlePresenceChange = (newState: PresenceState) => {
      setState(newState);
      callbacks?.onPresenceChange?.(newState);
    };

    const cleanup = setupAwarenessListeners(awareness, {
      ...callbacks,
      onPresenceChange: handlePresenceChange,
    });

    // Initial state sync
    const remoteUsers = getRemoteStates(awareness);
    const localUser = awareness.getLocalState() as UserPresence | null;
    setState({
      localUser,
      remoteUsers,
      userCount: remoteUsers.length + (localUser ? 1 : 0),
    });

    return cleanup;
  }, [awareness, isReady, callbacks]);

  // Cursor update function
  const handleUpdateCursor = useCallback(
    (cursor: CursorPosition | null) => {
      if (!awareness) return;
      updateCursor(awareness, cursor);
    },
    [awareness]
  );

  // Selection update function
  const handleUpdateSelection = useCallback(
    (selection: UserPresence['selection']) => {
      if (!awareness) return;
      updateSelection(awareness, selection);
    },
    [awareness]
  );

  // Name update function
  const handleUpdateName = useCallback(
    (name: string) => {
      if (!awareness) return;

      const currentState = awareness.getLocalState() as UserPresence | null;
      if (currentState) {
        awareness.setLocalState({
          ...currentState,
          name,
          lastSeen: Date.now(),
        });
      }
    },
    [awareness]
  );

  return {
    state,
    updateCursor: handleUpdateCursor,
    updateSelection: handleUpdateSelection,
    updateName: handleUpdateName,
    isReady,
  };
}

/**
 * Hook for accessing only remote users
 */
export function useRemoteUsers(awareness: Awareness | null): {
  remoteUsers: UserPresence[];
  userCount: number;
  isReady: boolean;
} {
  const [remoteUsers, setRemoteUsers] = useState<UserPresence[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!awareness) {
      setRemoteUsers([]);
      setIsReady(false);
      return;
    }

    const handleChange = () => {
      const users = getRemoteStates(awareness);
      setRemoteUsers(users);
    };

    awareness.on('change', handleChange);
    setIsReady(true);

    // Initial sync
    handleChange();

    return () => {
      awareness.off('change', handleChange);
      setIsReady(false);
    };
  }, [awareness]);

  const userCount = useMemo(() => {
    const localUser = awareness?.getLocalState();
    return remoteUsers.length + (localUser ? 1 : 0);
  }, [remoteUsers.length, awareness]);

  return {
    remoteUsers,
    userCount,
    isReady,
  };
}

/**
 * Hook for accessing only local user state
 */
export function useLocalUser(
  awareness: Awareness | null,
  config: PresenceConfig
): {
  localUser: UserPresence | null;
  updateCursor: (cursor: CursorPosition | null) => void;
  updateSelection: (selection: UserPresence['selection']) => void;
  updateName: (name: string) => void;
  setLocalState: (state: Partial<UserPresence>) => void;
  isReady: boolean;
} {
  const [localUser, setLocalUser] = useState<UserPresence | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Initialize local user
  useEffect(() => {
    if (!awareness) {
      setIsReady(false);
      return;
    }

    try {
      const user = initializeLocalUser(awareness, config);
      setLocalUser(user);
      setIsReady(true);
    } catch (error) {
      console.error('Failed to initialize local user:', error);
      setIsReady(false);
    }
  }, [awareness, config.pubkey, config.name, config.color]);

  // Sync local user state changes
  useEffect(() => {
    if (!awareness || !isReady) return;

    const handleChange = () => {
      const state = awareness.getLocalState() as UserPresence | null;
      setLocalUser(state);
    };

    awareness.on('change', handleChange);

    return () => {
      awareness.off('change', handleChange);
    };
  }, [awareness, isReady]);

  // Action functions
  const handleUpdateCursor = useCallback(
    (cursor: CursorPosition | null) => {
      if (!awareness) return;
      updateCursor(awareness, cursor);
    },
    [awareness]
  );

  const handleUpdateSelection = useCallback(
    (selection: UserPresence['selection']) => {
      if (!awareness) return;
      updateSelection(awareness, selection);
    },
    [awareness]
  );

  const handleUpdateName = useCallback(
    (name: string) => {
      if (!awareness) return;

      const currentState = awareness.getLocalState() as UserPresence | null;
      if (currentState) {
        awareness.setLocalState({
          ...currentState,
          name,
          lastSeen: Date.now(),
        });
      }
    },
    [awareness]
  );

  const handleSetLocalState = useCallback(
    (state: Partial<UserPresence>) => {
      if (!awareness) return;

      const currentState = awareness.getLocalState() as UserPresence | null;
      if (currentState) {
        awareness.setLocalState({
          ...currentState,
          ...state,
          lastSeen: Date.now(),
        });
      }
    },
    [awareness]
  );

  return {
    localUser,
    updateCursor: handleUpdateCursor,
    updateSelection: handleUpdateSelection,
    updateName: handleUpdateName,
    setLocalState: handleSetLocalState,
    isReady,
  };
}

/**
 * Hook for tracking specific user by pubkey
 */
export function useUserPresence(
  awareness: Awareness | null,
  pubkey: string
): {
  user: UserPresence | null;
  isOnline: boolean;
} {
  const [user, setUser] = useState<UserPresence | null>(null);

  useEffect(() => {
    if (!awareness) {
      setUser(null);
      return;
    }

    const handleChange = () => {
      const states = awareness.getStates();
      let foundUser: UserPresence | null = null;

      states.forEach(state => {
        if (state && state.pubkey === pubkey) {
          foundUser = state as UserPresence;
        }
      });

      setUser(foundUser);
    };

    awareness.on('change', handleChange);

    // Initial check
    handleChange();

    return () => {
      awareness.off('change', handleChange);
    };
  }, [awareness, pubkey]);

  const isOnline = useMemo(() => {
    if (!user) return false;
    const now = Date.now();
    return now - user.lastSeen < 30000; // 30 seconds timeout
  }, [user]);

  return {
    user,
    isOnline,
  };
}
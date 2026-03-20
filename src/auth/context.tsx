/**
 * @fileoverview React context provider for Nostr authentication
 * Provides unified auth state management across Cloistr collaboration apps
 */

import { createContext, useContext, useReducer, useCallback, useEffect, ReactNode, useState } from 'react';
import { AuthState, AuthContextValue, SignerInterface, Nip46Config } from './types.js';
import { connectNip07, isNip07Supported } from './nip07.js';
import { connectNip46, isNip46Supported } from './nip46.js';

/**
 * Initial authentication state
 */
const initialAuthState: AuthState = {
  pubkey: null,
  isConnected: false,
  method: null,
  isConnecting: false,
  error: null,
};

/**
 * Auth state actions
 */
type AuthAction =
  | { type: 'CONNECTING'; method: 'nip07' | 'nip46' }
  | { type: 'CONNECTED'; pubkey: string; method: 'nip07' | 'nip46' }
  | { type: 'DISCONNECTED' }
  | { type: 'ERROR'; error: string };

/**
 * Auth state reducer
 */
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'CONNECTING':
      return {
        ...state,
        isConnecting: true,
        error: null,
        method: action.method,
      };

    case 'CONNECTED':
      return {
        ...state,
        pubkey: action.pubkey,
        isConnected: true,
        method: action.method,
        isConnecting: false,
        error: null,
      };

    case 'DISCONNECTED':
      return {
        ...initialAuthState,
      };

    case 'ERROR':
      return {
        ...state,
        isConnecting: false,
        error: action.error,
      };

    default:
      return state;
  }
}

/**
 * Auth context
 */
const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Local storage keys for persistence
 */
const STORAGE_KEYS = {
  AUTH_METHOD: 'cloistr:auth:method',
  BUNKER_URL: 'cloistr:auth:bunkerUrl',
  PUBKEY: 'cloistr:auth:pubkey',
} as const;

/**
 * Props for AuthProvider component
 */
export interface AuthProviderProps {
  children: ReactNode;
  /** Whether to automatically restore previous session on mount */
  autoRestore?: boolean;
  /** Custom storage implementation (defaults to localStorage) */
  storage?: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  } | null;
}

/**
 * AuthProvider component - provides auth context to child components
 */
export function AuthProvider({
  children,
  autoRestore = true,
  storage = typeof window !== 'undefined' ? window.localStorage : null
}: AuthProviderProps) {
  const [authState, dispatch] = useReducer(authReducer, initialAuthState);
  const [signer, setSigner] = useState<SignerInterface | null>(null);

  /**
   * Save auth state to storage
   */
  const saveToStorage = useCallback((method: 'nip07' | 'nip46', pubkey: string, bunkerUrl?: string) => {
    if (!storage) return;

    try {
      storage.setItem(STORAGE_KEYS.AUTH_METHOD, method);
      storage.setItem(STORAGE_KEYS.PUBKEY, pubkey);
      if (bunkerUrl && method === 'nip46') {
        storage.setItem(STORAGE_KEYS.BUNKER_URL, bunkerUrl);
      }
    } catch (error) {
      console.warn('Failed to save auth state to storage:', error);
    }
  }, [storage]);

  /**
   * Clear auth state from storage
   */
  const clearStorage = useCallback(() => {
    if (!storage) return;

    try {
      storage.removeItem(STORAGE_KEYS.AUTH_METHOD);
      storage.removeItem(STORAGE_KEYS.BUNKER_URL);
      storage.removeItem(STORAGE_KEYS.PUBKEY);
    } catch (error) {
      console.warn('Failed to clear auth state from storage:', error);
    }
  }, [storage]);

  /**
   * Connect using NIP-07 browser extension
   */
  const connectNip07Handler = useCallback(async () => {
    if (!isNip07Supported()) {
      dispatch({ type: 'ERROR', error: 'NIP-07 is not supported in this environment' });
      return;
    }

    dispatch({ type: 'CONNECTING', method: 'nip07' });

    try {
      const newSigner = await connectNip07();
      const pubkey = await newSigner.getPublicKey();

      setSigner(newSigner);
      dispatch({ type: 'CONNECTED', pubkey, method: 'nip07' });
      saveToStorage('nip07', pubkey);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect with NIP-07';
      dispatch({ type: 'ERROR', error: errorMessage });
      setSigner(null);
    }
  }, [saveToStorage]);

  /**
   * Connect using NIP-46 remote signer
   */
  const connectNip46Handler = useCallback(async (config: Nip46Config) => {
    if (!isNip46Supported()) {
      dispatch({ type: 'ERROR', error: 'NIP-46 is not supported in this environment' });
      return;
    }

    dispatch({ type: 'CONNECTING', method: 'nip46' });

    try {
      const newSigner = await connectNip46(config);
      const pubkey = await newSigner.getPublicKey();

      setSigner(newSigner);
      dispatch({ type: 'CONNECTED', pubkey, method: 'nip46' });
      saveToStorage('nip46', pubkey, config.bunkerUrl);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect with NIP-46';
      dispatch({ type: 'ERROR', error: errorMessage });
      setSigner(null);
    }
  }, [saveToStorage]);

  /**
   * Disconnect current signer
   */
  const disconnectHandler = useCallback(async () => {
    if (signer && signer.disconnect) {
      try {
        await signer.disconnect();
      } catch (error) {
        console.warn('Error during signer disconnect:', error);
      }
    }

    setSigner(null);
    dispatch({ type: 'DISCONNECTED' });
    clearStorage();
  }, [signer, clearStorage]);

  /**
   * Restore previous session from storage
   */
  const restoreSession = useCallback(async () => {
    if (!storage || !autoRestore) return;

    try {
      const method = storage.getItem(STORAGE_KEYS.AUTH_METHOD) as 'nip07' | 'nip46' | null;
      const savedPubkey = storage.getItem(STORAGE_KEYS.PUBKEY);

      if (!method || !savedPubkey) return;

      if (method === 'nip07' && isNip07Supported()) {
        // Try to reconnect with NIP-07
        await connectNip07Handler();
      } else if (method === 'nip46' && isNip46Supported()) {
        // Try to reconnect with NIP-46
        const bunkerUrl = storage.getItem(STORAGE_KEYS.BUNKER_URL);
        if (bunkerUrl) {
          await connectNip46Handler({ bunkerUrl });
        }
      }
    } catch (error) {
      console.warn('Failed to restore auth session:', error);
      clearStorage();
    }
  }, [storage, autoRestore, connectNip07Handler, connectNip46Handler, clearStorage]);

  /**
   * Auto-restore session on mount
   */
  useEffect(() => {
    if (autoRestore) {
      restoreSession();
    }
  }, [autoRestore, restoreSession]);

  /**
   * Context value
   */
  const contextValue: AuthContextValue = {
    authState,
    connectNip07: connectNip07Handler,
    connectNip46: connectNip46Handler,
    disconnect: disconnectHandler,
    signer,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context
 * @returns Auth context value
 * @throws Error if used outside AuthProvider
 */
export function useNostrAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useNostrAuth must be used within an AuthProvider');
  }

  return context;
}

/**
 * Hook for convenience functions
 */
export function useAuthHelpers() {
  const { authState, signer } = useNostrAuth();

  return {
    /** Whether any authentication method is available */
    isAuthAvailable: isNip07Supported() || isNip46Supported(),
    /** Whether NIP-07 is available */
    isNip07Available: isNip07Supported(),
    /** Whether NIP-46 is available */
    isNip46Available: isNip46Supported(),
    /** Whether user is currently authenticated */
    isAuthenticated: authState.isConnected && !!signer,
    /** Current user's public key (null if not authenticated) */
    userPubkey: authState.pubkey,
    /** Current authentication method (null if not authenticated) */
    authMethod: authState.method,
  };
}
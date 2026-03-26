/**
 * @fileoverview Session persistence for NIP-46 connections
 * Enables session restoration across page reloads
 */

import { Nip46Session, SessionPersistence } from './types.js';

/** Default storage key for NIP-46 session */
const DEFAULT_STORAGE_KEY = 'cloistr_nip46_session';

/**
 * Manages NIP-46 session persistence using localStorage
 */
export class SessionManager implements SessionPersistence {
  private storageKey: string;

  constructor(storageKey: string = DEFAULT_STORAGE_KEY) {
    this.storageKey = storageKey;
  }

  /**
   * Check if a saved session exists
   */
  hasSavedSession(): boolean {
    if (typeof localStorage === 'undefined') {
      return false;
    }
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return false;

      const session = JSON.parse(stored) as Nip46Session;
      // Validate session has required fields
      return !!(
        session.userPubkey &&
        session.remotePubkey &&
        session.clientSecretKey &&
        session.bunkerUrl
      );
    } catch {
      return false;
    }
  }

  /**
   * Save session data to localStorage
   */
  saveSession(session: Nip46Session): void {
    if (typeof localStorage === 'undefined') {
      console.warn('[Session] localStorage not available, session will not persist');
      return;
    }
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(session));
      console.log('[Session] Session saved');
    } catch (err) {
      console.warn('[Session] Failed to save session:', err);
    }
  }

  /**
   * Load session data from localStorage
   */
  loadSession(): Nip46Session | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return null;

      const session = JSON.parse(stored) as Nip46Session;

      // Validate required fields
      if (!session.userPubkey || !session.remotePubkey ||
          !session.clientSecretKey || !session.bunkerUrl) {
        console.warn('[Session] Invalid session data, clearing');
        this.clearSession();
        return null;
      }

      return session;
    } catch (err) {
      console.warn('[Session] Failed to load session:', err);
      this.clearSession();
      return null;
    }
  }

  /**
   * Clear saved session from localStorage
   */
  clearSession(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.removeItem(this.storageKey);
      console.log('[Session] Session cleared');
    } catch (err) {
      console.warn('[Session] Failed to clear session:', err);
    }
  }

  /**
   * Update specific session fields (preserves other data)
   */
  updateSession(updates: Partial<Nip46Session>): void {
    const current = this.loadSession();
    if (!current) {
      console.warn('[Session] No session to update');
      return;
    }
    this.saveSession({ ...current, ...updates });
  }

  /**
   * Get the storage key being used
   */
  getStorageKey(): string {
    return this.storageKey;
  }
}

/**
 * Create a session manager with default or custom storage key
 */
export function createSessionManager(storageKey?: string): SessionManager {
  return new SessionManager(storageKey);
}

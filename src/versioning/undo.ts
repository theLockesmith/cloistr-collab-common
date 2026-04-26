/**
 * @fileoverview Undo manager wrapper for Yjs
 * Provides undo/redo functionality with React-friendly state
 */

import * as Y from 'yjs';
import { UndoManager } from 'yjs';
import { UndoState, UndoConfig } from './types.js';

/**
 * Create and configure a Yjs UndoManager
 */
export function createUndoManager(
  _doc: Y.Doc,
  scope: Y.AbstractType<any> | Y.AbstractType<any>[],
  config: UndoConfig = {}
): UndoManager {
  const undoManager = new UndoManager(scope, {
    trackedOrigins: config.trackedOrigins,
    captureTimeout: config.captureTimeout ?? 500,
  });

  // Set max stack size if configured
  // Note: UndoManager doesn't have a built-in max size, we'd need to
  // manually trim on each add if we want this feature

  return undoManager;
}

/**
 * Get current undo/redo state
 */
export function getUndoState(undoManager: UndoManager): UndoState {
  return {
    canUndo: undoManager.canUndo(),
    canRedo: undoManager.canRedo(),
    undoStackSize: undoManager.undoStack.length,
    redoStackSize: undoManager.redoStack.length,
  };
}

/**
 * Perform undo operation
 */
export function performUndo(undoManager: UndoManager): boolean {
  if (!undoManager.canUndo()) {
    return false;
  }
  undoManager.undo();
  return true;
}

/**
 * Perform redo operation
 */
export function performRedo(undoManager: UndoManager): boolean {
  if (!undoManager.canRedo()) {
    return false;
  }
  undoManager.redo();
  return true;
}

/**
 * Clear undo/redo history
 */
export function clearUndoHistory(undoManager: UndoManager): void {
  undoManager.clear();
}

/**
 * Stop tracking changes temporarily
 */
export function stopTracking(undoManager: UndoManager): void {
  undoManager.stopCapturing();
}

/**
 * Resume tracking changes
 */
export function resumeTracking(_undoManager: UndoManager): void {
  // UndoManager doesn't have a resumeCapturing method
  // It starts capturing automatically on next change
}

/**
 * Wrapper class for enhanced undo management
 */
export class EnhancedUndoManager {
  private undoManager: UndoManager;
  private stateChangeCallbacks: Set<(state: UndoState) => void> = new Set();

  constructor(
    doc: Y.Doc,
    scope: Y.AbstractType<any> | Y.AbstractType<any>[],
    config: UndoConfig = {}
  ) {
    this.undoManager = createUndoManager(doc, scope, config);

    // Listen for stack changes
    this.undoManager.on('stack-item-added', () => this.notifyStateChange());
    this.undoManager.on('stack-item-popped', () => this.notifyStateChange());
    this.undoManager.on('stack-cleared', () => this.notifyStateChange());
  }

  /**
   * Get current state
   */
  getState(): UndoState {
    return getUndoState(this.undoManager);
  }

  /**
   * Undo last change
   */
  undo(): boolean {
    return performUndo(this.undoManager);
  }

  /**
   * Redo last undone change
   */
  redo(): boolean {
    return performRedo(this.undoManager);
  }

  /**
   * Clear history
   */
  clear(): void {
    clearUndoHistory(this.undoManager);
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(callback: (state: UndoState) => void): () => void {
    this.stateChangeCallbacks.add(callback);
    return () => {
      this.stateChangeCallbacks.delete(callback);
    };
  }

  /**
   * Notify all listeners of state change
   */
  private notifyStateChange(): void {
    const state = this.getState();
    for (const callback of this.stateChangeCallbacks) {
      callback(state);
    }
  }

  /**
   * Stop capturing (useful for batch operations)
   */
  stopCapturing(): void {
    this.undoManager.stopCapturing();
  }

  /**
   * Get underlying UndoManager
   */
  getUndoManager(): UndoManager {
    return this.undoManager;
  }

  /**
   * Destroy and clean up
   */
  destroy(): void {
    this.undoManager.destroy();
    this.stateChangeCallbacks.clear();
  }
}

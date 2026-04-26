/**
 * @fileoverview Shared toolbar component for collaboration apps
 * Provides document title, undo/redo, save status, and sharing
 */

import React, { useState, useCallback } from 'react';
import type { ToolbarProps } from './types.js';

/**
 * Format relative time (e.g., "2 minutes ago")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) {
    return 'just now';
  } else if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(diff / 86400000);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
}

/**
 * Shared toolbar component for Cloistr collaboration apps
 */
export function Toolbar({
  title,
  onTitleChange,
  undoState,
  onUndo,
  onRedo,
  onSave,
  isSaving = false,
  hasUnsavedChanges = false,
  lastSavedAt,
  onShare,
  permission = 'view',
  isConnected = false,
  peerCount = 0,
  customActions,
  compact = false,
  className = '',
  style = {},
}: ToolbarProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(title || '');

  const canEdit = permission === 'edit' || permission === 'admin';
  const canShare = permission === 'admin';

  const handleTitleClick = useCallback(() => {
    if (onTitleChange && canEdit) {
      setEditedTitle(title || '');
      setIsEditingTitle(true);
    }
  }, [onTitleChange, canEdit, title]);

  const handleTitleSubmit = useCallback(() => {
    if (onTitleChange && editedTitle !== title) {
      onTitleChange(editedTitle);
    }
    setIsEditingTitle(false);
  }, [onTitleChange, editedTitle, title]);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSubmit();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
    }
  }, [handleTitleSubmit]);

  const toolbarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: compact ? '8px' : '16px',
    padding: compact ? '8px 12px' : '12px 16px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e5e7eb',
    ...style,
  };

  const buttonStyle: React.CSSProperties = {
    padding: compact ? '4px 8px' : '6px 12px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    fontSize: compact ? '12px' : '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  };

  const disabledButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    opacity: 0.5,
    cursor: 'not-allowed',
  };

  return (
    <div style={toolbarStyle} className={className}>
      {/* Title */}
      {title !== undefined && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isEditingTitle ? (
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={handleTitleKeyDown}
              autoFocus
              style={{
                fontSize: compact ? '14px' : '18px',
                fontWeight: 600,
                border: '1px solid #3b82f6',
                borderRadius: '4px',
                padding: '4px 8px',
                outline: 'none',
                flex: 1,
                maxWidth: '400px',
              }}
            />
          ) : (
            <h1
              onClick={handleTitleClick}
              style={{
                fontSize: compact ? '14px' : '18px',
                fontWeight: 600,
                margin: 0,
                cursor: onTitleChange && canEdit ? 'pointer' : 'default',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '400px',
              }}
              title={onTitleChange && canEdit ? 'Click to edit' : undefined}
            >
              {title || 'Untitled'}
            </h1>
          )}

          {/* Save status */}
          {!compact && (
            <span style={{ fontSize: '12px', color: '#6b7280' }}>
              {isSaving ? (
                'Saving...'
              ) : hasUnsavedChanges ? (
                <span style={{ color: '#f59e0b' }}>Unsaved changes</span>
              ) : lastSavedAt ? (
                `Saved ${formatRelativeTime(lastSavedAt)}`
              ) : null}
            </span>
          )}
        </div>
      )}

      {/* Connection status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          borderRadius: '4px',
          backgroundColor: isConnected ? '#dcfce7' : '#fef2f2',
          color: isConnected ? '#166534' : '#991b1b',
          fontSize: '12px',
        }}
        title={isConnected ? `Connected (${peerCount} peer${peerCount !== 1 ? 's' : ''})` : 'Disconnected'}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: isConnected ? '#22c55e' : '#ef4444',
          }}
        />
        {!compact && (
          <span>
            {isConnected ? (peerCount > 0 ? `${peerCount + 1} online` : 'Online') : 'Offline'}
          </span>
        )}
      </div>

      {/* Undo/Redo */}
      {(onUndo || onRedo) && (
        <div style={{ display: 'flex', gap: '4px' }}>
          {onUndo && (
            <button
              onClick={onUndo}
              disabled={!undoState?.canUndo}
              style={undoState?.canUndo ? buttonStyle : disabledButtonStyle}
              title="Undo (Ctrl+Z)"
            >
              ↩
              {!compact && <span>Undo</span>}
            </button>
          )}
          {onRedo && (
            <button
              onClick={onRedo}
              disabled={!undoState?.canRedo}
              style={undoState?.canRedo ? buttonStyle : disabledButtonStyle}
              title="Redo (Ctrl+Y)"
            >
              ↪
              {!compact && <span>Redo</span>}
            </button>
          )}
        </div>
      )}

      {/* Save button */}
      {onSave && canEdit && (
        <button
          onClick={onSave}
          disabled={isSaving || !hasUnsavedChanges}
          style={!isSaving && hasUnsavedChanges ? buttonStyle : disabledButtonStyle}
          title="Save (Ctrl+S)"
        >
          💾
          {!compact && <span>{isSaving ? 'Saving...' : 'Save'}</span>}
        </button>
      )}

      {/* Share button */}
      {onShare && canShare && (
        <button
          onClick={onShare}
          style={{
            ...buttonStyle,
            backgroundColor: '#3b82f6',
            color: '#ffffff',
            border: 'none',
          }}
          title="Share"
        >
          🔗
          {!compact && <span>Share</span>}
        </button>
      )}

      {/* Custom actions */}
      {customActions}
    </div>
  );
}

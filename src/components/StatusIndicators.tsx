/**
 * @fileoverview Status indicator components
 * Connection status, save status, and version info
 */

import React from 'react';
import type { ConnectionStatusProps, SaveStatusProps, VersionHistoryProps } from './types.js';

/**
 * Format relative time
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) return 'just now';
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes}m ago`;
  }
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  }
  const days = Math.floor(diff / 86400000);
  return `${days}d ago`;
}

/**
 * Connection status indicator
 */
export function ConnectionStatus({
  isConnected,
  relayCount = 0,
  peerCount = 0,
  showDetails = true,
  onClick,
  className = '',
  style = {},
}: ConnectionStatusProps) {
  const containerStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    borderRadius: '16px',
    backgroundColor: isConnected ? '#dcfce7' : '#fef2f2',
    color: isConnected ? '#166534' : '#991b1b',
    fontSize: '12px',
    fontWeight: 500,
    cursor: onClick ? 'pointer' : 'default',
    ...style,
  };

  const dotStyle: React.CSSProperties = {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: isConnected ? '#22c55e' : '#ef4444',
  };

  return (
    <div style={containerStyle} className={className} onClick={onClick}>
      <span style={dotStyle} />
      {showDetails ? (
        <span>
          {isConnected ? (
            <>
              {relayCount > 0 && `${relayCount} relay${relayCount > 1 ? 's' : ''}`}
              {relayCount > 0 && peerCount > 0 && ' · '}
              {peerCount > 0 && `${peerCount} peer${peerCount > 1 ? 's' : ''}`}
              {relayCount === 0 && peerCount === 0 && 'Connected'}
            </>
          ) : (
            'Disconnected'
          )}
        </span>
      ) : (
        <span>{isConnected ? 'Online' : 'Offline'}</span>
      )}
    </div>
  );
}

/**
 * Save status indicator
 */
export function SaveStatus({
  isSaving,
  hasUnsavedChanges,
  lastSavedAt,
  autoSaveEnabled = false,
  onSave,
  className = '',
  style = {},
}: SaveStatusProps) {
  const containerStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#6b7280',
    ...style,
  };

  const dotStyle: React.CSSProperties = {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: isSaving ? '#3b82f6' : hasUnsavedChanges ? '#f59e0b' : '#22c55e',
  };

  return (
    <div style={containerStyle} className={className}>
      <span style={dotStyle} />
      {isSaving ? (
        <span>Saving...</span>
      ) : hasUnsavedChanges ? (
        <>
          <span style={{ color: '#f59e0b' }}>Unsaved changes</span>
          {onSave && (
            <button
              onClick={onSave}
              style={{
                border: 'none',
                background: 'none',
                color: '#3b82f6',
                cursor: 'pointer',
                fontSize: '12px',
                textDecoration: 'underline',
                padding: 0,
              }}
            >
              Save now
            </button>
          )}
        </>
      ) : lastSavedAt ? (
        <span>
          Saved {formatRelativeTime(lastSavedAt)}
          {autoSaveEnabled && ' (auto-save on)'}
        </span>
      ) : (
        <span>Not saved yet</span>
      )}
    </div>
  );
}

/**
 * Version history panel
 */
export function VersionHistory({
  versions,
  currentVersionId,
  onRestore,
  isRestoring = false,
  showLabels = true,
  showAuthor = false,
  className = '',
  style = {},
}: VersionHistoryProps) {
  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    ...style,
  };

  const itemStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    backgroundColor: isActive ? '#eff6ff' : '#f9fafb',
    borderRadius: '6px',
    border: isActive ? '1px solid #3b82f6' : '1px solid transparent',
    cursor: 'pointer',
  });

  const buttonStyle: React.CSSProperties = {
    padding: '4px 10px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    fontSize: '12px',
    cursor: 'pointer',
  };

  if (versions.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#6b7280', padding: '20px' }}>
        No versions yet
      </div>
    );
  }

  return (
    <div style={containerStyle} className={className}>
      {versions.map((version) => {
        const isActive = version.id === currentVersionId;

        return (
          <div key={version.id} style={itemStyle(isActive)}>
            <div>
              <div style={{ fontWeight: 500, fontSize: '14px' }}>
                {showLabels && version.label ? version.label : `Version ${version.version}`}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {formatRelativeTime(version.timestamp)}
                {showAuthor && ` by ${version.authorPubkey.slice(0, 8)}...`}
              </div>
              {version.description && (
                <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                  {version.description}
                </div>
              )}
            </div>
            {!isActive && (
              <button
                onClick={() => onRestore(version.id)}
                disabled={isRestoring}
                style={{ ...buttonStyle, opacity: isRestoring ? 0.7 : 1 }}
              >
                {isRestoring ? '...' : 'Restore'}
              </button>
            )}
            {isActive && (
              <span style={{ fontSize: '12px', color: '#3b82f6', fontWeight: 500 }}>
                Current
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
